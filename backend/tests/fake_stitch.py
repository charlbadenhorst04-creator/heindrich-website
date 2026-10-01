"""TEST ONLY. A stand-in for Stitch's token endpoint and GraphQL API.

Nothing in the app imports this. It lets the Stitch code be driven over
real HTTP - real requests, real JSON, real failures - rather than against
mocks that only ever agree with whatever the code already does. It speaks
the shapes Stitch documents, the same as
frontend/netlify/functions/_shared/fake-stitch-server.mts.
"""

import base64
import hashlib
import hmac
import json
import threading
import time
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs


class FakeStitch:
    def __init__(self) -> None:
        self.token_requests: list[dict[str, str]] = []
        self.graphql_calls: list[dict] = []
        self.requests: dict[str, dict] = {}
        # Make the next token request fail with this OAuth error.
        self.reject_credentials: str | None = None
        # Make every create return a GraphQL error with this message.
        self.fail_create: str | None = None
        # Overrides what node() reports, per request id.
        self.override_amount: dict[str, dict | None] = {}
        self.override_external_reference: dict[str, str | None] = {}
        self._issued: set[str] = set()
        self._lock = threading.Lock()

        fake = self

        class Handler(BaseHTTPRequestHandler):
            def log_message(self, *_args):  # keep test output clean
                pass

            def _send(self, status: int, body: dict) -> None:
                raw = json.dumps(body).encode()
                self.send_response(status)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(raw)))
                self.end_headers()
                self.wfile.write(raw)

            def do_POST(self):  # noqa: N802 - http.server API
                length = int(self.headers.get("Content-Length") or 0)
                raw = self.rfile.read(length).decode()
                if self.path == "/connect/token":
                    return self._send(*fake._token(raw))
                if self.path == "/graphql":
                    return self._send(*fake._graphql(raw, self.headers.get("Authorization", "")))
                self._send(404, {"error": "not found"})

        self._server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        self._server.daemon_threads = True
        port = self._server.server_address[1]
        self.url = f"http://127.0.0.1:{port}"
        self.token_url = f"{self.url}/connect/token"
        self.api_url = f"{self.url}/graphql"
        threading.Thread(target=self._server.serve_forever, daemon=True).start()

    def close(self) -> None:
        self._server.shutdown()

    def set_state(self, request_id: str, state: str) -> None:
        self.requests[request_id]["state"] = state

    def request_for(self, order_id: str) -> dict:
        for request in self.requests.values():
            if request["externalReference"] == order_id:
                return request
        raise AssertionError(f"no Stitch request for order {order_id}")

    def _token(self, raw: str) -> tuple[int, dict]:
        form = {k: v[0] for k, v in parse_qs(raw).items()}
        with self._lock:
            self.token_requests.append(form)
            if self.reject_credentials:
                error, self.reject_credentials = self.reject_credentials, None
                return 400, {"error": error, "error_description": "Client authentication failed"}
            if form.get("grant_type") != "client_credentials" or not form.get("client_id") or not form.get("client_secret"):
                return 400, {"error": "invalid_request"}
            token = f"tok-{uuid.uuid4().hex}"
            self._issued.add(token)
        return 200, {"access_token": token, "expires_in": 3600, "token_type": "Bearer", "scope": form.get("scope")}

    def _graphql(self, raw: str, authorization: str) -> tuple[int, dict]:
        body = json.loads(raw)
        self.graphql_calls.append({"query": body.get("query", ""), "variables": body.get("variables") or {}})
        if authorization.removeprefix("Bearer ") not in self._issued:
            return 401, {"errors": [{"message": "Unauthorized"}]}

        query, variables = body.get("query", ""), body.get("variables") or {}
        if "clientPaymentInitiationRequestCreate" in query:
            if self.fail_create:
                return 200, {"data": None, "errors": [{"message": self.fail_create}]}
            amount = variables.get("amount") or {}
            if not isinstance(amount.get("quantity"), (int, float)) or amount.get("currency") != "ZAR":
                return 200, {"data": None, "errors": [{"message": "Invalid MoneyInput"}]}
            request_id = base64.b64encode(f"payreq/{uuid.uuid4()}".encode()).decode()
            self.requests[request_id] = {
                "id": request_id,
                "externalReference": variables.get("externalReference"),
                "amount": amount,
                "state": "PaymentInitiationRequestPending",
                "variables": variables,
                "query": query,
            }
            return 200, {
                "data": {
                    "clientPaymentInitiationRequestCreate": {
                        "paymentInitiationRequest": {"id": request_id, "url": f"{self.url}/pay/{request_id}"}
                    }
                }
            }

        if "node(" in query:
            request = self.requests.get(variables.get("id"))
            if request is None:
                return 200, {"data": {"node": None}}
            rid = request["id"]
            return 200, {
                "data": {
                    "node": {
                        "id": rid,
                        "externalReference": self.override_external_reference.get(rid, request["externalReference"]),
                        "amount": self.override_amount.get(rid, request["amount"]),
                        "state": {"__typename": request["state"]},
                    }
                }
            }

        return 200, {"errors": [{"message": "unknown operation"}]}


def sign_webhook(body: bytes, secret: str, *, msg_id: str | None = None, timestamp: int | None = None) -> dict[str, str]:
    """Signs a webhook body the way Stitch's webhook service (Svix) does."""
    msg_id = msg_id or f"msg_{uuid.uuid4().hex}"
    ts = str(int(time.time()) if timestamp is None else timestamp)
    key = base64.b64decode(secret.removeprefix("whsec_"))
    digest = hmac.new(key, f"{msg_id}.{ts}.".encode() + body, hashlib.sha256).digest()
    return {
        "svix-id": msg_id,
        "svix-timestamp": ts,
        "svix-signature": f"v1,{base64.b64encode(digest).decode()}",
        "Content-Type": "application/json",
    }


# One shared instance for the whole suite, started on import so conftest can
# point the app's settings at it before the app is imported.
SERVER = FakeStitch()
WEBHOOK_SECRET = "whsec_" + base64.b64encode(uuid.uuid4().bytes + uuid.uuid4().bytes).decode()
