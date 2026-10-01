/**
 * TEST ONLY. A stand-in for Stitch's token endpoint and GraphQL API.
 *
 * Nothing in the shop imports this, so it is never bundled into a deployed
 * function. It exists so the Stitch code can be driven over real HTTP -
 * real requests, real JSON, real failures - rather than against mocks that
 * only ever agree with whatever the code already does.
 *
 * It implements the shapes Stitch documents: a client-credentials token
 * endpoint, clientPaymentInitiationRequestCreate, and node(id) returning a
 * PaymentInitiationRequest whose state is a typed union.
 */
import crypto from "node:crypto";
import http from "node:http";
import type { AddressInfo } from "node:net";

export interface FakePaymentRequest {
  id: string;
  externalReference: string | null;
  amount: { quantity: number; currency: string };
  state: string;
  variables: Record<string, any>;
  query: string;
}

export interface FakeStitch {
  url: string;
  tokenUrl: string;
  apiUrl: string;
  tokenRequests: URLSearchParams[];
  graphqlCalls: { query: string; variables: any; authorization: string | undefined }[];
  requests: Map<string, FakePaymentRequest>;
  /** Make the next token request fail with this OAuth error. */
  rejectCredentials: string | null;
  /** Make every create return a GraphQL error with this message. */
  failCreate: string | null;
  /** Make the next N GraphQL calls answer 401. */
  unauthorizedNext: number;
  /** Overrides what node() reports, per request id. */
  overrideAmount: Map<string, { quantity: number; currency: string } | null>;
  overrideExternalReference: Map<string, string | null>;
  setState(id: string, state: string): void;
  close(): Promise<void>;
}

export async function startFakeStitch(): Promise<FakeStitch> {
  let tokenCounter = 0;
  let requestCounter = 0;
  const issued = new Set<string>();

  const fake: FakeStitch = {
    url: "",
    tokenUrl: "",
    apiUrl: "",
    tokenRequests: [],
    graphqlCalls: [],
    requests: new Map(),
    rejectCredentials: null,
    failCreate: null,
    unauthorizedNext: 0,
    overrideAmount: new Map(),
    overrideExternalReference: new Map(),
    setState(id, state) {
      const request = fake.requests.get(id);
      if (!request) throw new Error(`fake Stitch has no request ${id}`);
      request.state = state;
    },
    close: async () => {},
  };

  const server = http.createServer(async (req, res) => {
    let raw = "";
    for await (const chunk of req) raw += chunk;

    const send = (status: number, body: unknown) => {
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(JSON.stringify(body));
    };

    if (req.method === "POST" && req.url === "/connect/token") {
      const form = new URLSearchParams(raw);
      fake.tokenRequests.push(form);
      if (fake.rejectCredentials) {
        const error = fake.rejectCredentials;
        fake.rejectCredentials = null;
        return send(400, { error, error_description: "Client authentication failed" });
      }
      if (form.get("grant_type") !== "client_credentials" || !form.get("client_id") || !form.get("client_secret")) {
        return send(400, { error: "invalid_request" });
      }
      const token = `tok-${++tokenCounter}`;
      issued.add(token);
      return send(200, { access_token: token, expires_in: 3600, token_type: "Bearer", scope: form.get("scope") });
    }

    if (req.method === "POST" && req.url === "/graphql") {
      const authorization = req.headers.authorization;
      let body: any;
      try {
        body = JSON.parse(raw);
      } catch {
        return send(400, { errors: [{ message: "bad json" }] });
      }
      fake.graphqlCalls.push({ query: body.query, variables: body.variables, authorization });

      const token = authorization?.replace(/^Bearer /, "") ?? "";
      if (fake.unauthorizedNext > 0) {
        fake.unauthorizedNext--;
        return send(401, { errors: [{ message: "Unauthorized" }] });
      }
      if (!issued.has(token)) return send(401, { errors: [{ message: "Unauthorized" }] });

      const query: string = body.query ?? "";
      const vars = body.variables ?? {};

      if (query.includes("clientPaymentInitiationRequestCreate")) {
        if (fake.failCreate) {
          return send(200, { data: null, errors: [{ message: fake.failCreate }] });
        }
        if (!vars.amount || typeof vars.amount.quantity !== "number" || vars.amount.currency !== "ZAR") {
          return send(200, { data: null, errors: [{ message: "Invalid MoneyInput" }] });
        }
        const id = Buffer.from(`payreq/${++requestCounter}-${crypto.randomUUID()}`).toString("base64");
        fake.requests.set(id, {
          id,
          externalReference: vars.externalReference ?? null,
          amount: vars.amount,
          state: "PaymentInitiationRequestPending",
          variables: vars,
          query,
        });
        return send(200, {
          data: {
            clientPaymentInitiationRequestCreate: {
              paymentInitiationRequest: { id, url: `${fake.url}/pay/${encodeURIComponent(id)}` },
            },
          },
        });
      }

      if (query.includes("node(")) {
        const request = fake.requests.get(vars.id);
        if (!request) return send(200, { data: { node: null } });
        return send(200, {
          data: {
            node: {
              id: request.id,
              externalReference: fake.overrideExternalReference.has(request.id)
                ? fake.overrideExternalReference.get(request.id)
                : request.externalReference,
              amount: fake.overrideAmount.has(request.id)
                ? fake.overrideAmount.get(request.id)
                : request.amount,
              state: { __typename: request.state },
            },
          },
        });
      }

      return send(200, { errors: [{ message: "unknown operation" }] });
    }

    send(404, { error: "not found" });
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  fake.url = `http://127.0.0.1:${port}`;
  fake.tokenUrl = `${fake.url}/connect/token`;
  fake.apiUrl = `${fake.url}/graphql`;
  fake.close = () => new Promise<void>((resolve) => server.close(() => resolve()));
  return fake;
}

/** Signs a webhook body the way Stitch's webhook service (Svix) does. */
export function signWebhook(body: string, secret: string, opts: { id?: string; timestamp?: number } = {}) {
  const id = opts.id ?? `msg_${crypto.randomUUID()}`;
  const timestamp = String(opts.timestamp ?? Math.floor(Date.now() / 1000));
  const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const signature = crypto.createHmac("sha256", key).update(`${id}.${timestamp}.${body}`).digest("base64");
  return {
    "svix-id": id,
    "svix-timestamp": timestamp,
    "svix-signature": `v1,${signature}`,
  };
}
