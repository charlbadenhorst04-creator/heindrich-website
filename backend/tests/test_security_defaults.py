"""The security posture of a default deployment.

These assert the settings a public site is actually served with, so a later
change that quietly re-exposes something fails here.
"""

import httpx
import pytest
from httpx import ASGITransport

from app.core.config import Settings, settings
from app.core.ratelimit import RateLimitMiddleware
from app.main import create_app


def _client_for(app) -> httpx.AsyncClient:
    return httpx.AsyncClient(transport=ASGITransport(app=app), base_url="http://testserver")


# --- API documentation -----------------------------------------------------


async def test_api_docs_are_not_served_by_default(monkeypatch):
    """Swagger/ReDoc publish every endpoint and request shape. A public
    deployment should not hand that out without being asked."""
    monkeypatch.setattr(settings, "ENABLE_API_DOCS", False)
    async with _client_for(create_app()) as client:
        for path in ("/docs", "/redoc", "/openapi.json"):
            assert (await client.get(path)).status_code == 404, f"{path} is exposed"


async def test_api_docs_can_be_turned_on_deliberately(monkeypatch):
    monkeypatch.setattr(settings, "ENABLE_API_DOCS", True)
    async with _client_for(create_app()) as client:
        assert (await client.get("/docs")).status_code == 200
        assert (await client.get("/openapi.json")).status_code == 200


# --- account routes --------------------------------------------------------


async def test_account_routes_are_unmounted_by_default(monkeypatch):
    """Nothing in the storefront signs in, so a public registration endpoint
    is attack surface with no upside."""
    monkeypatch.setattr(settings, "ENABLE_ACCOUNTS", False)
    async with _client_for(create_app()) as client:
        register = await client.post(
            "/api/auth/register",
            json={"email": "someone@example.com", "password": "SecurePass123!"},
        )
        assert register.status_code == 404
        assert (await client.post("/api/auth/login", json={})).status_code == 404


async def test_account_routes_appear_when_enabled(monkeypatch):
    monkeypatch.setattr(settings, "ENABLE_ACCOUNTS", True)
    async with _client_for(create_app()) as client:
        # Reached the route (422 for the empty body), rather than 404.
        assert (await client.post("/api/auth/login", json={})).status_code == 422


# --- rate limiting ---------------------------------------------------------


async def test_checkout_is_rate_limited_per_ip():
    app = create_app()
    # Replace the middleware's rules with a tiny, explicit limit.
    for middleware in app.user_middleware:
        if middleware.cls is RateLimitMiddleware:
            middleware.kwargs["rules"] = {"/api/orders/checkout": 3}
    app.middleware_stack = app.build_middleware_stack()

    async with _client_for(app) as client:
        codes = [
            (await client.post("/api/orders/checkout", json={})).status_code for _ in range(6)
        ]

    assert codes.count(429) == 3, f"expected the last three to be throttled, got {codes}"
    assert codes[-1] == 429


async def test_browsing_and_cart_traffic_are_never_rate_limited():
    """South African mobile networks put many subscribers behind one public
    IP, and the storefront reads the cart on every page load. Limiting that
    would eventually lock real shoppers out of their own carts."""
    app = create_app()
    for middleware in app.user_middleware:
        if middleware.cls is RateLimitMiddleware:
            middleware.kwargs["rules"] = dict(
                __import__("app.core.ratelimit", fromlist=["DEFAULT_RULES"]).DEFAULT_RULES
            )
    app.middleware_stack = app.build_middleware_stack()

    async with _client_for(app) as client:
        codes = [(await client.get("/api/products")).status_code for _ in range(80)]
        cart_codes = [
            (await client.get(f"/api/cart/shared-ip-session-{i}")).status_code for i in range(80)
        ]

    assert 429 not in codes, "product browsing was throttled"
    assert 429 not in cart_codes, "cart reads were throttled"


async def test_payfast_callback_is_never_rate_limited():
    """Payfast retries anything that is not a 200, so a throttled callback
    would leave a genuinely paid order unconfirmed."""
    app = create_app()
    for middleware in app.user_middleware:
        if middleware.cls is RateLimitMiddleware:
            middleware.kwargs["rules"] = {"/api": 2}  # limit everything...
    app.middleware_stack = app.build_middleware_stack()

    async with _client_for(app) as client:
        codes = [
            (await client.post("/api/payments/payfast/notify", data={})).status_code
            for _ in range(6)
        ]

    assert 429 not in codes, "the Payfast callback was throttled"


# --- go-live configuration guards -----------------------------------------


def _live_settings(**overrides):
    base = {
        "PAYFAST_MODE": "live",
        "SECRET_KEY": "a-real-long-random-secret-value-for-testing",
        "DATABASE_URL": "postgresql+asyncpg://meravo:a-strong-password@db:5432/meravo",
        "BACKEND_CORS_ORIGINS": "https://meravo.co.za",
    }
    base.update(overrides)
    return base


def test_live_mode_accepts_a_properly_configured_deployment():
    assert Settings(**_live_settings()).PAYFAST_MODE == "live"


def test_live_mode_refuses_a_placeholder_secret_key():
    with pytest.raises(ValueError, match="SECRET_KEY"):
        Settings(**_live_settings(SECRET_KEY="change-me-to-a-long-random-string"))


def test_live_mode_refuses_a_placeholder_database_password():
    with pytest.raises(ValueError, match="POSTGRES_PASSWORD"):
        Settings(
            **_live_settings(
                DATABASE_URL="postgresql+asyncpg://meravo:change-me@db:5432/meravo"
            )
        )


def test_live_mode_refuses_a_plain_http_domain():
    """A live store handling payments must be served over https."""
    with pytest.raises(ValueError, match="https"):
        Settings(**_live_settings(BACKEND_CORS_ORIGINS="http://meravo.co.za"))


def test_localhost_over_http_is_still_fine_in_live_mode():
    """So a live-mode smoke test on the server itself isn't blocked."""
    assert Settings(
        **_live_settings(BACKEND_CORS_ORIGINS="https://meravo.co.za,http://localhost:8090")
    )


def test_sandbox_mode_stays_zero_config():
    """Local and sandbox work must not need any of this."""
    assert Settings(PAYFAST_MODE="sandbox", SECRET_KEY="change-me-to-a-long-random-string")
