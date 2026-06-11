/**
 * diagrams.free — Google OAuth token proxy (refresh tokens in KV, access tokens to browser).
 */

export interface Env {
  OAUTH_KV: KVNamespace;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET?: string;
  ALLOWED_ORIGINS: string;
  SESSION_SIGNING_KEY: string;
}

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const SESSION_COOKIE = "df_oauth";
const SESSION_TTL_SEC = 60 * 60 * 24 * 400; // ~13 months

type StoredSession = {
  refreshToken: string;
  sub: string;
  email?: string;
};

type TokenResponse = {
  access_token?: string;
  expires_in?: number;
  refresh_token?: string;
  id_token?: string;
  error?: string;
  error_description?: string;
};

const parseAllowedOrigins = (raw: string): Set<string> =>
  new Set(
    raw
      .split(",")
      .map((o) => o.trim())
      .filter(Boolean),
  );

const corsHeaders = (origin: string | null, allowed: Set<string>): Headers => {
  const headers = new Headers({
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  });
  if (origin && allowed.has(origin)) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Access-Control-Allow-Credentials", "true");
  }
  return headers;
};

const jsonResponse = (
  body: unknown,
  status: number,
  origin: string | null,
  allowed: Set<string>,
  extra?: HeadersInit,
): Response => {
  const headers = corsHeaders(origin, allowed);
  headers.set("Content-Type", "application/json");
  if (extra) {
    new Headers(extra).forEach((v, k) => headers.set(k, v));
  }
  return new Response(JSON.stringify(body), { status, headers });
};

const readJson = async <T>(request: Request): Promise<T | null> => {
  try {
    return (await request.json()) as T;
  } catch {
    return null;
  }
};

const bytesToHex = (bytes: Uint8Array): string =>
  [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");

const importHmacKey = async (secret: string): Promise<CryptoKey> =>
  crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );

const signSessionId = async (sessionId: string, secret: string): Promise<string> => {
  const key = await importHmacKey(secret);
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(sessionId),
  );
  return bytesToHex(new Uint8Array(sig));
};

const createSessionCookie = async (
  sessionId: string,
  signingKey: string,
): Promise<string> => {
  const sig = await signSessionId(sessionId, signingKey);
  const value = `${sessionId}.${sig}`;
  return `${SESSION_COOKIE}=${value}; Path=/; HttpOnly; Secure; SameSite=None; Max-Age=${SESSION_TTL_SEC}; Domain=.diagrams.free`;
};

const clearSessionCookie = (): string =>
  `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=None; Max-Age=0; Domain=.diagrams.free`;

const parseSessionCookie = async (
  cookieHeader: string | null,
  signingKey: string,
): Promise<string | null> => {
  if (!cookieHeader) {
    return null;
  }
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${SESSION_COOKIE}=([^;]+)`));
  if (!match) {
    return null;
  }
  const raw = decodeURIComponent(match[1]);
  const dot = raw.lastIndexOf(".");
  if (dot <= 0) {
    return null;
  }
  const sessionId = raw.slice(0, dot);
  const sig = raw.slice(dot + 1);
  const expected = await signSessionId(sessionId, signingKey);
  if (sig !== expected || sessionId.length < 16) {
    return null;
  }
  return sessionId;
};

const kvKey = (sessionId: string): string => `sess:${sessionId}`;

const storeSession = async (
  kv: KVNamespace,
  sessionId: string,
  data: StoredSession,
): Promise<void> => {
  await kv.put(kvKey(sessionId), JSON.stringify(data), {
    expirationTtl: SESSION_TTL_SEC,
  });
};

const loadSession = async (
  kv: KVNamespace,
  sessionId: string,
): Promise<StoredSession | null> => {
  const raw = await kv.get(kvKey(sessionId));
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw) as StoredSession;
  } catch {
    return null;
  }
};

const decodeJwtPayload = (jwt: string): Record<string, unknown> | null => {
  const parts = jwt.split(".");
  if (parts.length < 2) {
    return null;
  }
  try {
    const json = atob(parts[1].replace(/-/g, "+").replace(/_/g, "/"));
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
};

const missingClientSecretResponse = (): TokenResponse => ({
  error: "invalid_client",
  error_description:
    "OAuth proxy: GOOGLE_CLIENT_SECRET is not set on the Worker (required for Web OAuth clients).",
});

const googleTokenRequest = async (
  params: Record<string, string>,
  env: Env,
): Promise<TokenResponse> => {
  if (!env.GOOGLE_CLIENT_SECRET?.trim()) {
    return missingClientSecretResponse();
  }
  const body = new URLSearchParams(params);
  body.set("client_secret", env.GOOGLE_CLIENT_SECRET);
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  return (await response.json()) as TokenResponse;
};

const accessTokenPayload = (
  token: TokenResponse,
): { access_token: string; expires_in: number } | { error: string } => {
  if (!token.access_token) {
    return {
      error: token.error_description || token.error || "token_exchange_failed",
    };
  }
  return {
    access_token: token.access_token,
    expires_in: token.expires_in ?? 3600,
  };
};

const handleExchange = async (
  request: Request,
  env: Env,
  origin: string | null,
  allowed: Set<string>,
): Promise<Response> => {
  const body = await readJson<{
    code?: string;
    code_verifier?: string;
    redirect_uri?: string;
  }>(request);
  if (!body?.code || !body.code_verifier || !body.redirect_uri) {
    return jsonResponse({ error: "invalid_request" }, 400, origin, allowed);
  }

  const token = await googleTokenRequest(
    {
      grant_type: "authorization_code",
      code: body.code,
      client_id: env.GOOGLE_CLIENT_ID,
      redirect_uri: body.redirect_uri,
      code_verifier: body.code_verifier,
    },
    env,
  );

  if (!token.access_token) {
    return jsonResponse(
      { error: token.error_description || token.error || "exchange_failed" },
      401,
      origin,
      allowed,
    );
  }

  const refreshToken = token.refresh_token;
  if (!refreshToken) {
    return jsonResponse(
      { error: "no_refresh_token — sign in again with consent" },
      401,
      origin,
      allowed,
    );
  }

  let sub = "unknown";
  let email: string | undefined;
  if (token.id_token) {
    const claims = decodeJwtPayload(token.id_token);
    if (typeof claims?.sub === "string") {
      sub = claims.sub;
    }
    if (typeof claims?.email === "string") {
      email = claims.email;
    }
  }

  const sessionId = bytesToHex(crypto.getRandomValues(new Uint8Array(32)));
  await storeSession(env.OAUTH_KV, sessionId, {
    refreshToken,
    sub,
    email,
  });

  const cookie = await createSessionCookie(sessionId, env.SESSION_SIGNING_KEY);
  const payload = accessTokenPayload(token);
  if ("error" in payload) {
    return jsonResponse({ error: payload.error }, 401, origin, allowed);
  }

  return jsonResponse(
    { ...payload, email },
    200,
    origin,
    allowed,
    { "Set-Cookie": cookie },
  );
};

const handleRefresh = async (
  request: Request,
  env: Env,
  origin: string | null,
  allowed: Set<string>,
): Promise<Response> => {
  const sessionId = await parseSessionCookie(
    request.headers.get("Cookie"),
    env.SESSION_SIGNING_KEY,
  );
  if (!sessionId) {
    return jsonResponse({ error: "no_session" }, 401, origin, allowed);
  }

  const stored = await loadSession(env.OAUTH_KV, sessionId);
  if (!stored) {
    return jsonResponse({ error: "session_expired" }, 401, origin, allowed, {
      "Set-Cookie": clearSessionCookie(),
    });
  }

  const token = await googleTokenRequest(
    {
      grant_type: "refresh_token",
      refresh_token: stored.refreshToken,
      client_id: env.GOOGLE_CLIENT_ID,
    },
    env,
  );

  const payload = accessTokenPayload(token);
  if ("error" in payload) {
    return jsonResponse({ error: payload.error }, 401, origin, allowed, {
      "Set-Cookie": clearSessionCookie(),
    });
  }

  if (token.refresh_token && token.refresh_token !== stored.refreshToken) {
    await storeSession(env.OAUTH_KV, sessionId, {
      ...stored,
      refreshToken: token.refresh_token,
    });
  }

  return jsonResponse({ ...payload, email: stored.email }, 200, origin, allowed);
};

const handleRevoke = async (
  request: Request,
  env: Env,
  origin: string | null,
  allowed: Set<string>,
): Promise<Response> => {
  const sessionId = await parseSessionCookie(
    request.headers.get("Cookie"),
    env.SESSION_SIGNING_KEY,
  );
  if (sessionId) {
    await env.OAUTH_KV.delete(kvKey(sessionId));
  }
  return jsonResponse({ ok: true }, 200, origin, allowed, {
    "Set-Cookie": clearSessionCookie(),
  });
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = request.headers.get("Origin");
    const allowed = parseAllowedOrigins(env.ALLOWED_ORIGINS);
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(origin, allowed) });
    }

    if (url.pathname === "/health" && request.method === "GET") {
      return jsonResponse({ ok: true }, 200, origin, allowed);
    }

    if (!env.SESSION_SIGNING_KEY) {
      return jsonResponse({ error: "worker_not_configured" }, 503, origin, allowed);
    }

    if (url.pathname === "/oauth/exchange" && request.method === "POST") {
      return handleExchange(request, env, origin, allowed);
    }
    if (url.pathname === "/oauth/refresh" && request.method === "POST") {
      return handleRefresh(request, env, origin, allowed);
    }
    if (url.pathname === "/oauth/revoke" && request.method === "POST") {
      return handleRevoke(request, env, origin, allowed);
    }

    return jsonResponse({ error: "not_found" }, 404, origin, allowed);
  },
};
