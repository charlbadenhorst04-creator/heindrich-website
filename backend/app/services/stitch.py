"""Stitch (stitch.money) - card and Pay by Bank through Stitch's hosted page.

The flow, per Stitch's documentation:

1. Exchange the client id and secret for a short-lived client token
   (OAuth client credentials, scope ``client_paymentrequest``).
2. Create a payment request with ``clientPaymentInitiationRequestCreate``.
   Stitch answers with a URL on its own hosted page, which offers every
   method Stitch has switched on for the account - card, Pay by Bank, and
   so on.
3. Send the customer there with ``?redirect_uri=`` appended. That address
   must be on the client's whitelist at Stitch, and must be https.
4. The customer comes back with ``?id=&status=&externalReference=`` on the
   URL. Stitch's own docs warn that this status can be tampered with, so it
   is never used to decide anything about money.
5. The truth is fetched from Stitch's API with the ``node()`` query - on the
   customer's return, and again whenever Stitch's webhook fires.

No card or bank account number is ever sent to, or stored by, this
application: card details are typed into Stitch's page.

Every URL is overridable by setting, so if a default turns out to differ
from what Stitch's live API wants, that is a setting to change rather than
code to rewrite. This mirrors frontend/netlify/functions/_shared/stitch.mts.
"""

import base64
import hashlib
import hmac
import time
from dataclasses import dataclass
from decimal import Decimal, InvalidOperation
from typing import Any
from urllib.parse import quote, urlparse

import httpx

from app.core.config import settings

# Stitch's bank-statement reference fields are short.
PAYER_REFERENCE_MAX = 12
BENEFICIARY_REFERENCE_MAX = 20

# A slow Stitch must not hold a checkout - or a webhook - open forever.
REQUEST_TIMEOUT_SECONDS = 10

# How old a signed webhook may be before it is treated as a replay.
WEBHOOK_TOLERANCE_SECONDS = 5 * 60


class StitchError(Exception):
    """Anything that went wrong talking to Stitch. The message is safe to
    log: it never contains the client secret."""


def stitch_configured() -> bool:
    return bool(settings.STITCH_CLIENT_ID.strip() and settings.STITCH_CLIENT_SECRET.strip())


def looks_like_test_client() -> bool:
    """Stitch test clients' ids are prefixed ``test-``."""
    return settings.STITCH_CLIENT_ID.strip().lower().startswith("test-")


# ---------------------------------------------------------------------------
# Client token
# ---------------------------------------------------------------------------

_cached_token: dict[str, Any] | None = None


def forget_token_for_tests() -> None:
    global _cached_token
    _cached_token = None


async def client_token(scope: str = "client_paymentrequest") -> str:
    """A client token, reused until shortly before it expires.

    Tokens last an hour; fetching one per payment would double the round
    trips on every checkout and webhook for no gain. The cache is keyed on
    the credentials, so a changed secret is never served an old token.
    """
    global _cached_token
    client_id = settings.STITCH_CLIENT_ID.strip()
    client_secret = settings.STITCH_CLIENT_SECRET.strip()
    if not client_id or not client_secret:
        raise StitchError("STITCH_CLIENT_ID and STITCH_CLIENT_SECRET are not both set")

    owner = f"{client_id}:{scope}:{hashlib.sha256(client_secret.encode()).hexdigest()}"
    now = time.monotonic()
    if _cached_token and _cached_token["owner"] == owner and _cached_token["expires_at"] > now:
        return _cached_token["value"]

    try:
        async with httpx.AsyncClient(timeout=REQUEST_TIMEOUT_SECONDS) as client:
            response = await client.post(
                settings.STITCH_TOKEN_URL,
                data={
                    "grant_type": "client_credentials",
                    "client_id": client_id,
                    "client_secret": client_secret,
                    "scope": scope,
                },
            )
    except httpx.HTTPError as error:
        raise StitchError(f"could not reach Stitch for a token: {error}") from error

    try:
        payload = response.json()
    except ValueError:
        payload = None

    if response.status_code != 200 or not isinstance(payload, dict) or not payload.get("access_token"):
        # Stitch's own wording ("invalid_client" and the like); never the secret.
        reason = response.text[:200]
        if isinstance(payload, dict):
            reason = payload.get("error_description") or payload.get("error") or reason
        raise StitchError(f"Stitch refused the client credentials ({response.status_code}): {reason}")

    try:
        lifetime = int(payload.get("expires_in") or 3600)
    except (TypeError, ValueError):
        lifetime = 3600
    _cached_token = {
        "value": payload["access_token"],
        # Renewed a minute early so a token never expires mid-request.
        "expires_at": now + max(30, lifetime - 60),
        "owner": owner,
    }
    return _cached_token["value"]


# ---------------------------------------------------------------------------
# GraphQL
# ---------------------------------------------------------------------------


async def _graphql(query: str, variables: dict[str, Any]) -> dict[str, Any]:
    global _cached_token
    token = await client_token()
    try:
        async with httpx.AsyncClient(timeout=REQUEST_TIMEOUT_SECONDS) as client:
            response = await client.post(
                settings.STITCH_API_URL,
                json={"query": query, "variables": variables},
                headers={"Authorization": f"Bearer {token}"},
            )
    except httpx.HTTPError as error:
        raise StitchError(f"could not reach Stitch: {error}") from error

    if response.status_code == 401:
        # A revoked or rotated secret: ask again next time instead of
        # failing for the rest of the hour.
        _cached_token = None

    try:
        payload = response.json()
    except ValueError as error:
        raise StitchError(
            f"Stitch answered {response.status_code} with something that is not JSON"
        ) from error

    # GraphQL reports most failures with a 200 and an errors array.
    errors = payload.get("errors") if isinstance(payload, dict) else None
    if isinstance(errors, list) and errors:
        messages = "; ".join(
            str(e.get("message", e)) if isinstance(e, dict) else str(e) for e in errors
        )
        raise StitchError(f"Stitch rejected the request: {messages}")
    if response.status_code != 200:
        raise StitchError(f"Stitch answered {response.status_code}")
    return (payload or {}).get("data") or {}


# ---------------------------------------------------------------------------
# Creating a payment request
# ---------------------------------------------------------------------------

# For a payment paid into a bank account the merchant names on each request.
CREATE_WITH_BENEFICIARY = """
mutation CreatePaymentRequest(
  $amount: MoneyInput!,
  $payerReference: String!,
  $beneficiaryReference: String!,
  $externalReference: String,
  $beneficiaryName: String!,
  $beneficiaryBankId: BankBeneficiaryBankId!,
  $beneficiaryAccountNumber: String!
) {
  clientPaymentInitiationRequestCreate(input: {
    amount: $amount,
    payerReference: $payerReference,
    beneficiaryReference: $beneficiaryReference,
    externalReference: $externalReference,
    beneficiary: {
      bankAccount: {
        name: $beneficiaryName,
        bankId: $beneficiaryBankId,
        accountNumber: $beneficiaryAccountNumber
      }
    }
  }) {
    paymentInitiationRequest { id url }
  }
}"""

# For a client whose settlement account is held by Stitch.
CREATE_WITHOUT_BENEFICIARY = """
mutation CreatePaymentRequest(
  $amount: MoneyInput!,
  $payerReference: String!,
  $beneficiaryReference: String!,
  $externalReference: String
) {
  clientPaymentInitiationRequestCreate(input: {
    amount: $amount,
    payerReference: $payerReference,
    beneficiaryReference: $beneficiaryReference,
    externalReference: $externalReference
  }) {
    paymentInitiationRequest { id url }
  }
}"""


@dataclass
class Beneficiary:
    name: str
    bank_id: str
    account_number: str


def configured_beneficiary() -> Beneficiary | None:
    """The settlement account, if one is configured. All three or nothing."""
    name = settings.STITCH_BENEFICIARY_NAME.strip()
    bank_id = settings.STITCH_BENEFICIARY_BANK_ID.strip().lower()
    account_number = "".join(settings.STITCH_BENEFICIARY_ACCOUNT_NUMBER.split())
    if not (name or bank_id or account_number):
        return None
    if not (name and bank_id and account_number):
        raise StitchError(
            "STITCH_BENEFICIARY_NAME, STITCH_BENEFICIARY_BANK_ID and "
            "STITCH_BENEFICIARY_ACCOUNT_NUMBER must be set together, or not at all"
        )
    return Beneficiary(name=name, bank_id=bank_id, account_number=account_number)


@dataclass
class CreatedPaymentRequest:
    id: str
    url: str
    # Where to send the customer: Stitch's page plus the return address.
    redirect_url: str


def _is_local(url: str) -> bool:
    return (urlparse(url).hostname or "") in {"localhost", "127.0.0.1"}


async def create_payment_request(
    *, order_id: str, amount: Decimal | float, return_url: str
) -> CreatedPaymentRequest:
    if not return_url.startswith("https://") and not _is_local(return_url):
        # Stitch refuses non-https return addresses; say so clearly here.
        raise StitchError(f"the return address must be https, got {return_url}")

    beneficiary = configured_beneficiary()
    short_ref = order_id.replace("-", "")[:8].upper()
    variables: dict[str, Any] = {
        # Two decimals, as a number - the shape Stitch documents for MoneyInput.
        "amount": {"quantity": round(float(amount), 2), "currency": "ZAR"},
        # What the customer sees on their own bank statement.
        "payerReference": (settings.STITCH_PAYER_REFERENCE or "MERAVO")[:PAYER_REFERENCE_MAX],
        # What lands on the shop's statement - enough to find the order.
        "beneficiaryReference": f"MERAVO {short_ref}"[:BENEFICIARY_REFERENCE_MAX],
        # The full order id, which Stitch hands back on return and in webhooks.
        "externalReference": order_id,
    }
    if beneficiary:
        variables.update(
            beneficiaryName=beneficiary.name,
            beneficiaryBankId=beneficiary.bank_id,
            beneficiaryAccountNumber=beneficiary.account_number,
        )
        data = await _graphql(CREATE_WITH_BENEFICIARY, variables)
    else:
        data = await _graphql(CREATE_WITHOUT_BENEFICIARY, variables)

    created = (data.get("clientPaymentInitiationRequestCreate") or {}).get(
        "paymentInitiationRequest"
    ) or {}
    if not created.get("id") or not created.get("url"):
        raise StitchError("Stitch accepted the request but returned no payment page")

    url = str(created["url"])
    separator = "&" if "?" in url else "?"
    return CreatedPaymentRequest(
        id=str(created["id"]),
        url=url,
        redirect_url=f"{url}{separator}redirect_uri={quote(return_url, safe='')}",
    )


# ---------------------------------------------------------------------------
# Reading a payment request's real state
# ---------------------------------------------------------------------------

STATUS_QUERY = """
query PaymentRequestStatus($id: ID!) {
  node(id: $id) {
    ... on PaymentInitiationRequest {
      id
      externalReference
      amount
      state { __typename }
    }
  }
}"""


@dataclass
class StitchPaymentRequest:
    id: str
    external_reference: str | None
    # None when Stitch's answer carried no amount we could read.
    amount_cents: int | None
    # completed | pending | cancelled | expired | unknown
    state: str
    raw_state: str


def map_state(typename: str | None) -> str:
    # Anything unrecognised is "not paid yet": guessing the other way would
    # mean shipping goods on a state nobody understood.
    return {
        "PaymentInitiationRequestCompleted": "completed",
        "PaymentInitiationRequestCancelled": "cancelled",
        "PaymentInitiationRequestExpired": "expired",
        "PaymentInitiationRequestPending": "pending",
    }.get(typename or "", "unknown" if typename else "pending")


def amount_to_cents(amount: Any) -> int | None:
    """Reads Stitch's MoneyAmount, which arrives as {quantity, currency}."""
    if amount is None:
        return None
    if isinstance(amount, dict):
        if amount.get("currency") and amount.get("currency") != "ZAR":
            return None
        amount = amount.get("quantity")
    try:
        value = Decimal(str(amount))
    except (InvalidOperation, ValueError):
        return None
    if not value.is_finite():
        return None
    return int((value * 100).to_integral_value())


async def get_payment_request(request_id: str) -> StitchPaymentRequest | None:
    data = await _graphql(STATUS_QUERY, {"id": request_id})
    node = data.get("node") or {}
    if not node.get("id"):
        return None
    raw_state = (node.get("state") or {}).get("__typename") or ""
    return StitchPaymentRequest(
        id=str(node["id"]),
        external_reference=node.get("externalReference"),
        amount_cents=amount_to_cents(node.get("amount")),
        state=map_state(raw_state),
        raw_state=raw_state,
    )


# ---------------------------------------------------------------------------
# Webhooks
# ---------------------------------------------------------------------------


def verify_webhook_signature(
    *,
    msg_id: str | None,
    timestamp: str | None,
    signature: str | None,
    body: bytes,
    secret: str,
    now: float | None = None,
) -> bool:
    """Verifies a webhook signed the way Stitch's webhook service (Svix)
    signs them: HMAC-SHA256 over ``<id>.<timestamp>.<raw body>``, keyed with
    the base64 part of the ``whsec_...`` secret, sent as space-separated
    ``v1,<base64>`` entries. The timestamp window makes a captured webhook
    useless to replay later; the comparison is constant-time."""
    if not (msg_id and timestamp and signature and secret):
        return False
    try:
        sent_at = int(timestamp)
    except ValueError:
        return False
    current = time.time() if now is None else now
    if abs(current - sent_at) > WEBHOOK_TOLERANCE_SECONDS:
        return False

    raw_key = secret[len("whsec_"):] if secret.startswith("whsec_") else secret
    try:
        key = base64.b64decode(raw_key, validate=True)
    except ValueError:
        return False
    if not key:
        return False

    expected = hmac.new(key, f"{msg_id}.{timestamp}.".encode() + body, hashlib.sha256).digest()
    for entry in signature.split(" "):
        version, _, value = entry.partition(",")
        if version != "v1" or not value:
            continue
        try:
            given = base64.b64decode(value, validate=True)
        except ValueError:
            continue
        if hmac.compare_digest(given, expected):
            return True
    return False


def webhook_candidates(payload: Any) -> tuple[list[str], list[str]]:
    """Every ``id`` and ``externalReference`` anywhere in a webhook body.

    Nothing in the body is trusted - it only says which order to go and
    check - so this does not depend on the body's exact shape, which Stitch
    has changed before. Returns (ids, external_references), capped at 20.
    """
    ids: list[str] = []
    refs: list[str] = []

    def visit(value: Any, depth: int) -> None:
        if depth > 8:
            return
        items = value.items() if isinstance(value, dict) else enumerate(value) if isinstance(value, list) else ()
        for key, child in items:
            if isinstance(child, str) and len(child) <= 512:
                if key == "id" and child not in ids:
                    ids.append(child)
                if key == "externalReference" and child not in refs:
                    refs.append(child)
            elif isinstance(child, (dict, list)):
                visit(child, depth + 1)

    visit(payload, 0)
    return ids[:20], refs[:20]
