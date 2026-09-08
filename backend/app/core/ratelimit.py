"""A small per-IP rate limit on the endpoints worth abusing.

Deliberately in-process and dependency-free: this is one container serving
one shop, so a shared store would be more moving parts than the problem
warrants. It exists to blunt scripted abuse - hammering checkout, or
guessing passwords - not to be a WAF.

Two things it deliberately does NOT limit:

- Browsing, and reading or editing a cart. South African mobile networks
  put many subscribers behind one public IP (CGNAT), and the storefront
  fetches the cart on every page load, so a shared-IP limit there would
  eventually lock real shoppers out of their own carts. Measured: a 60/min
  cap blocked the 61st cart read from an IP, which several shoppers on one
  mobile network would reach between them.
- The Payfast callback. Payfast retries anything that is not a 200, so a
  throttled callback would leave a genuinely paid order unconfirmed.

What is left is low-volume by nature: nobody legitimately checks out
twenty times a minute.
"""

import time
from collections import defaultdict, deque

from fastapi import Request
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

from app.core.config import settings

WINDOW_SECONDS = 60

# Prefix -> requests allowed per minute per IP. Longest match wins.
DEFAULT_RULES: dict[str, int] = {
    # Creates an order and signs a Payfast request. One real checkout per
    # shopper; anything near this ceiling is a script.
    "/api/orders/checkout": 20,
    # Password guessing. Only reachable when ENABLE_ACCOUNTS is on.
    "/api/auth": 10,
}

# Never limited, whatever the rules say. Payfast retries anything that is
# not a 200, so throttling this endpoint would leave genuinely paid orders
# unconfirmed. Enforced ahead of the rules rather than left implicit in
# them, so a later broad rule cannot quietly capture it.
ALWAYS_EXEMPT_PREFIXES = ("/api/payments",)


class RateLimitMiddleware(BaseHTTPMiddleware):
    def __init__(self, app, rules: dict[str, int] | None = None) -> None:
        super().__init__(app)
        if rules is not None:
            self.rules = rules
        elif settings.RATE_LIMIT_PER_MINUTE <= 0:
            # 0 turns limiting off entirely - used by the test suite, which
            # makes far more checkouts from one address than any shopper.
            self.rules = {}
        else:
            # One knob scales every rule, for a shop that outgrows these.
            factor = settings.RATE_LIMIT_PER_MINUTE / 60
            self.rules = {
                path: max(1, round(limit * factor)) for path, limit in DEFAULT_RULES.items()
            }
        self._hits: dict[tuple[str, str], deque[float]] = defaultdict(deque)

    def _client_ip(self, request: Request) -> str:
        # nginx sets X-Forwarded-For. The backend is not published to the
        # internet (see docker-compose), so this header only ever arrives
        # from our own proxy and the first entry is the real client.
        forwarded = request.headers.get("x-forwarded-for", "")
        if forwarded:
            return forwarded.split(",")[0].strip()
        return request.client.host if request.client else "unknown"

    def _rule_for(self, path: str) -> tuple[str, int] | None:
        if path.startswith(ALWAYS_EXEMPT_PREFIXES):
            return None

        match: tuple[str, int] | None = None
        for prefix, limit in self.rules.items():
            if path.startswith(prefix) and (match is None or len(prefix) > len(match[0])):
                match = (prefix, limit)
        return match

    async def dispatch(self, request: Request, call_next):
        rule = self._rule_for(request.url.path)
        if rule is None:
            return await call_next(request)

        prefix, limit = rule
        now = time.monotonic()
        hits = self._hits[(prefix, self._client_ip(request))]
        while hits and now - hits[0] > WINDOW_SECONDS:
            hits.popleft()

        if len(hits) >= limit:
            return JSONResponse(
                status_code=429,
                content={"detail": "Too many requests. Please slow down and try again shortly."},
                headers={"Retry-After": str(WINDOW_SECONDS)},
            )

        hits.append(now)

        # Keep the bucket map from growing without bound on a long-running
        # process: drop anything that has fully aged out.
        if len(self._hits) > 2048:
            for key in [
                key
                for key, seen in self._hits.items()
                if not seen or now - seen[-1] > WINDOW_SECONDS
            ]:
                del self._hits[key]

        return await call_next(request)
