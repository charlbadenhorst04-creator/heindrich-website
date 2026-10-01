/**
 * Stitch (stitch.money) - card and Pay by Bank through Stitch's hosted page.
 *
 * The flow, per Stitch's documentation:
 *
 *   1. Exchange the client id and secret for a short-lived client token
 *      (OAuth client credentials, scope client_paymentrequest).
 *   2. Create a payment request with clientPaymentInitiationRequestCreate.
 *      Stitch answers with a URL on its own hosted page, which offers every
 *      method Stitch has switched on for the account - card, Pay by Bank,
 *      and so on. One mutation covers all of them.
 *   3. Send the customer there with ?redirect_uri= appended. That address
 *      must be on the client's whitelist at Stitch, and must be https.
 *   4. The customer comes back with ?id=&status=&externalReference= on the
 *      URL. Stitch's own docs warn that this status can be tampered with,
 *      so it is never used to decide anything about money.
 *   5. The truth is fetched from Stitch's API with the node() query - on
 *      the customer's return, and again whenever Stitch's webhook fires.
 *
 * Card details never come anywhere near this code. They are typed into
 * Stitch's page, and the money settles to the account Stitch holds for the
 * merchant.
 *
 * Every URL is overridable by environment variable. Nothing here can be
 * exercised against the real Stitch from the machine it was written on, so
 * if any default turns out to differ from what Stitch's API actually wants,
 * that is a setting to change rather than code to rewrite.
 */
import crypto from "node:crypto";

import { env } from "./env.mts";

const DEFAULT_TOKEN_URL = "https://secure.stitch.money/connect/token";
const DEFAULT_API_URL = "https://api.stitch.money/graphql";

/** Stitch's bank-statement reference fields are short. */
const PAYER_REFERENCE_MAX = 12;
const BENEFICIARY_REFERENCE_MAX = 20;

/** A request that takes longer than this is treated as a failure, so a slow
 * Stitch cannot hold a customer's checkout - or a webhook - open forever. */
const REQUEST_TIMEOUT_MS = 10_000;

export class StitchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StitchError";
  }
}

function tokenUrl(): string {
  return env("STITCH_TOKEN_URL") || DEFAULT_TOKEN_URL;
}

function apiUrl(): string {
  return env("STITCH_API_URL") || DEFAULT_API_URL;
}

export function stitchConfigured(): boolean {
  return Boolean(env("STITCH_CLIENT_ID").trim() && env("STITCH_CLIENT_SECRET").trim());
}

/**
 * Stitch issues test clients and live clients from the same endpoints; a
 * test client's id is prefixed "test-". Informational only - it decides
 * nothing, but it is the first thing worth knowing when a payment that
 * "worked" never reached a bank.
 */
export function looksLikeTestClient(): boolean {
  return env("STITCH_CLIENT_ID").trim().toLowerCase().startsWith("test-");
}

// ---------------------------------------------------------------------------
// Client token
// ---------------------------------------------------------------------------

interface CachedToken {
  value: string;
  expiresAt: number;
  /** Which credentials it belongs to, so a changed secret is not served a
   * token minted for the old one. */
  owner: string;
}

let cachedToken: CachedToken | null = null;

/** Test hook. */
export function forgetStitchTokenForTests(): void {
  cachedToken = null;
}

/**
 * A client token, reused until shortly before it expires.
 *
 * Tokens last an hour. Fetching one per payment would double the round
 * trips on every checkout and every webhook for no gain.
 */
export async function clientToken(scope = "client_paymentrequest"): Promise<string> {
  const clientId = env("STITCH_CLIENT_ID").trim();
  const clientSecret = env("STITCH_CLIENT_SECRET").trim();
  if (!clientId || !clientSecret) {
    throw new StitchError("STITCH_CLIENT_ID and STITCH_CLIENT_SECRET are not both set");
  }

  const owner = `${clientId}:${scope}:${crypto.createHash("sha256").update(clientSecret).digest("hex")}`;
  const now = Date.now();
  if (cachedToken && cachedToken.owner === owner && cachedToken.expiresAt > now) {
    return cachedToken.value;
  }

  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: clientId,
    client_secret: clientSecret,
    scope,
  });

  let response: Response;
  try {
    response = await fetch(tokenUrl(), {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    throw new StitchError(`could not reach Stitch for a token: ${(error as Error).message}`);
  }

  const text = await response.text();
  let payload: any = null;
  try {
    payload = JSON.parse(text);
  } catch {
    // Reported below with the status code, which is the useful part.
  }

  if (!response.ok || !payload?.access_token) {
    // The error description is Stitch's own wording ("invalid_client" and
    // the like) and never contains the secret, so it is safe to surface.
    const reason = payload?.error_description || payload?.error || text.slice(0, 200);
    throw new StitchError(`Stitch refused the client credentials (${response.status}): ${reason}`);
  }

  const lifetimeSeconds = Number(payload.expires_in) || 3600;
  cachedToken = {
    value: payload.access_token,
    // Renewed a minute early so a token never expires mid-request.
    expiresAt: now + Math.max(30, lifetimeSeconds - 60) * 1000,
    owner,
  };
  return cachedToken.value;
}

// ---------------------------------------------------------------------------
// GraphQL
// ---------------------------------------------------------------------------

async function graphql<T>(query: string, variables: Record<string, unknown>): Promise<T> {
  const token = await clientToken();

  let response: Response;
  try {
    response = await fetch(apiUrl(), {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ query, variables }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    throw new StitchError(`could not reach Stitch: ${(error as Error).message}`);
  }

  if (response.status === 401) {
    // A revoked or rotated secret: drop the cached token so the next call
    // asks again instead of failing for the rest of the hour.
    cachedToken = null;
  }

  let payload: any;
  try {
    payload = await response.json();
  } catch {
    throw new StitchError(`Stitch answered ${response.status} with something that is not JSON`);
  }

  // GraphQL reports most failures with a 200 and an errors array, so the
  // status code alone says nothing about whether this worked.
  if (Array.isArray(payload?.errors) && payload.errors.length > 0) {
    const messages = payload.errors.map((e: any) => e?.message ?? String(e)).join("; ");
    throw new StitchError(`Stitch rejected the request: ${messages}`);
  }
  if (!response.ok) {
    throw new StitchError(`Stitch answered ${response.status}`);
  }
  return payload.data as T;
}

// ---------------------------------------------------------------------------
// Creating a payment request
// ---------------------------------------------------------------------------

// The shape documented by Stitch for a payment request paid into a bank
// account the merchant names.
const CREATE_WITH_BENEFICIARY = `
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
}`;

// For a client whose settlement account is held by Stitch rather than
// named on every request.
const CREATE_WITHOUT_BENEFICIARY = `
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
}`;

export interface Beneficiary {
  name: string;
  bankId: string;
  accountNumber: string;
}

/** The settlement account, if one is configured. All three or nothing. */
export function configuredBeneficiary(): Beneficiary | null {
  const name = env("STITCH_BENEFICIARY_NAME").trim();
  const bankId = env("STITCH_BENEFICIARY_BANK_ID").trim().toLowerCase();
  const accountNumber = env("STITCH_BENEFICIARY_ACCOUNT_NUMBER").replace(/\s+/g, "");
  if (!name && !bankId && !accountNumber) return null;
  if (!name || !bankId || !accountNumber) {
    throw new StitchError(
      "STITCH_BENEFICIARY_NAME, STITCH_BENEFICIARY_BANK_ID and " +
        "STITCH_BENEFICIARY_ACCOUNT_NUMBER must be set together, or not at all",
    );
  }
  return { name, bankId, accountNumber };
}

export interface CreatedPaymentRequest {
  id: string;
  /** Stitch's hosted page, as returned. */
  url: string;
  /** Where to send the customer: the page plus the return address. */
  redirectUrl: string;
}

export async function createPaymentRequest(opts: {
  orderId: string;
  amount: number;
  returnUrl: string;
}): Promise<CreatedPaymentRequest> {
  if (!/^https:\/\//.test(opts.returnUrl) && !isLocalUrl(opts.returnUrl)) {
    // Stitch refuses non-https return addresses on live clients; catching
    // it here gives a clear message instead of an opaque failure there.
    throw new StitchError(`the return address must be https, got ${opts.returnUrl}`);
  }

  const beneficiary = configuredBeneficiary();
  const shortRef = opts.orderId.replace(/-/g, "").slice(0, 8).toUpperCase();

  const common = {
    // Two decimals, as a number - the shape Stitch documents for MoneyInput.
    amount: { quantity: Math.round(opts.amount * 100) / 100, currency: "ZAR" },
    // What the customer sees on their own bank statement.
    payerReference: (env("STITCH_PAYER_REFERENCE") || "MERAVO").slice(0, PAYER_REFERENCE_MAX),
    // What lands on Meravo's statement - enough to find the order.
    beneficiaryReference: `MERAVO ${shortRef}`.slice(0, BENEFICIARY_REFERENCE_MAX),
    // The full order id, which Stitch hands back on return and in webhooks.
    externalReference: opts.orderId,
  };

  const data = beneficiary
    ? await graphql<any>(CREATE_WITH_BENEFICIARY, {
        ...common,
        beneficiaryName: beneficiary.name,
        beneficiaryBankId: beneficiary.bankId,
        beneficiaryAccountNumber: beneficiary.accountNumber,
      })
    : await graphql<any>(CREATE_WITHOUT_BENEFICIARY, common);

  const created = data?.clientPaymentInitiationRequestCreate?.paymentInitiationRequest;
  if (!created?.id || !created?.url) {
    throw new StitchError("Stitch accepted the request but returned no payment page");
  }

  const separator = String(created.url).includes("?") ? "&" : "?";
  return {
    id: created.id,
    url: created.url,
    redirectUrl: `${created.url}${separator}redirect_uri=${encodeURIComponent(opts.returnUrl)}`,
  };
}

function isLocalUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return host === "localhost" || host === "127.0.0.1";
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Reading a payment request's real state
// ---------------------------------------------------------------------------

const STATUS_QUERY = `
query PaymentRequestStatus($id: ID!) {
  node(id: $id) {
    ... on PaymentInitiationRequest {
      id
      externalReference
      amount
      state { __typename }
    }
  }
}`;

export type StitchPaymentState = "completed" | "pending" | "cancelled" | "expired" | "unknown";

export interface StitchPaymentRequest {
  id: string;
  externalReference: string | null;
  /** Null when Stitch's answer did not include an amount we could read. */
  amountCents: number | null;
  state: StitchPaymentState;
  /** Exactly what Stitch called it, for the logs. */
  rawState: string;
}

export function mapStitchState(typename: string | undefined | null): StitchPaymentState {
  switch (typename) {
    case "PaymentInitiationRequestCompleted":
      return "completed";
    case "PaymentInitiationRequestCancelled":
      return "cancelled";
    case "PaymentInitiationRequestExpired":
      return "expired";
    case "PaymentInitiationRequestPending":
      return "pending";
    default:
      // Anything unrecognised is treated as "not paid yet". Guessing the
      // other way would mean shipping goods on a state nobody understood.
      return typename ? "unknown" : "pending";
  }
}

/** Reads Stitch's MoneyAmount, which arrives as {quantity, currency}. */
export function amountToCents(amount: unknown): number | null {
  if (amount == null) return null;
  const quantity =
    typeof amount === "object" ? (amount as any).quantity : (amount as number | string);
  const value = Number(quantity);
  if (!Number.isFinite(value)) return null;
  if (typeof amount === "object" && (amount as any).currency && (amount as any).currency !== "ZAR") {
    return null;
  }
  return Math.round(value * 100);
}

export async function getPaymentRequest(id: string): Promise<StitchPaymentRequest | null> {
  const data = await graphql<any>(STATUS_QUERY, { id });
  const node = data?.node;
  if (!node?.id) return null;
  const rawState = node.state?.__typename ?? "";
  return {
    id: node.id,
    externalReference: node.externalReference ?? null,
    amountCents: amountToCents(node.amount),
    state: mapStitchState(rawState),
    rawState,
  };
}

// ---------------------------------------------------------------------------
// Webhook signatures
// ---------------------------------------------------------------------------

/** How old a signed webhook may be before it is treated as a replay. */
const WEBHOOK_TOLERANCE_SECONDS = 5 * 60;

/**
 * Verifies a webhook signed the way Stitch's webhook service (Svix) signs
 * them: HMAC-SHA256 over "<svix-id>.<svix-timestamp>.<raw body>", keyed with
 * the base64 part of the "whsec_..." secret, sent as one or more
 * space-separated "v1,<base64>" entries.
 *
 * The timestamp check is what makes a captured webhook useless to replay
 * later. The comparison is constant-time so the signature cannot be
 * recovered a byte at a time by timing.
 */
export function verifyWebhookSignature(opts: {
  id: string | null;
  timestamp: string | null;
  signature: string | null;
  body: string;
  secret: string;
  nowSeconds?: number;
}): boolean {
  const { id, timestamp, signature, body, secret } = opts;
  if (!id || !timestamp || !signature || !secret) return false;

  const sentAt = Number(timestamp);
  if (!Number.isFinite(sentAt)) return false;
  const now = opts.nowSeconds ?? Math.floor(Date.now() / 1000);
  if (Math.abs(now - sentAt) > WEBHOOK_TOLERANCE_SECONDS) return false;

  const rawKey = secret.startsWith("whsec_") ? secret.slice("whsec_".length) : secret;
  let key: Buffer;
  try {
    key = Buffer.from(rawKey, "base64");
  } catch {
    return false;
  }
  if (key.length === 0) return false;

  const expected = crypto
    .createHmac("sha256", key)
    .update(`${id}.${timestamp}.${body}`)
    .digest();

  return signature.split(" ").some((entry) => {
    const [version, value] = entry.split(",", 2);
    if (version !== "v1" || !value) return false;
    let given: Buffer;
    try {
      given = Buffer.from(value, "base64");
    } catch {
      return false;
    }
    return given.length === expected.length && crypto.timingSafeEqual(given, expected);
  });
}

/**
 * Pulls candidate identifiers out of a webhook body without depending on
 * its exact shape.
 *
 * Stitch has changed its webhook format before (the older one nests the
 * request under data.client.paymentInitiationRequests.node). Nothing in the
 * body is trusted anyway - it only says which order to go and check - so
 * every "id" and "externalReference" anywhere in it is collected and each
 * is looked up against orders this shop actually created.
 */
export function webhookCandidates(payload: unknown): { ids: string[]; externalReferences: string[] } {
  const ids = new Set<string>();
  const refs = new Set<string>();
  const visit = (value: unknown, depth: number) => {
    if (depth > 8 || value == null || typeof value !== "object") return;
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      if (typeof child === "string" && child.length <= 512) {
        if (key === "id") ids.add(child);
        if (key === "externalReference") refs.add(child);
      } else {
        visit(child, depth + 1);
      }
    }
  };
  visit(payload, 0);
  return { ids: [...ids].slice(0, 20), externalReferences: [...refs].slice(0, 20) };
}
