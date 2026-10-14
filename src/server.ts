import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";
import { loadAnalysisData } from "./lib/data-source";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;
const SESSION_COOKIE = "__Host-lp_radar_session";
const SESSION_TTL_SECONDS = 60 * 60 * 8;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_ATTEMPTS = 8;
const textEncoder = new TextEncoder();
const loginAttempts = new Map<string, { count: number; expiresAt: number }>();

type RuntimeEnv = Record<string, unknown>;

function getString(env: RuntimeEnv, key: string): string | undefined {
  const value = env[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function runtimeEnvironment(env: unknown): RuntimeEnv {
  const bindings = env && typeof env === "object" ? (env as RuntimeEnv) : {};
  const processEnv = typeof process === "undefined" ? {} : process.env;
  return { ...processEnv, ...bindings };
}

function securityConfigured(env: RuntimeEnv): boolean {
  return (
    (getString(env, "APP_ACCESS_PASSWORD")?.length ?? 0) >= 16 &&
    (getString(env, "APP_SESSION_SECRET")?.length ?? 0) >= 32
  );
}

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}

async function signSession(payload: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    textEncoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, textEncoder.encode(payload));
  return bytesToBase64Url(new Uint8Array(signature));
}

async function constantTimeEqual(left: string, right: string): Promise<boolean> {
  const [leftHash, rightHash] = await Promise.all([
    crypto.subtle.digest("SHA-256", textEncoder.encode(left)),
    crypto.subtle.digest("SHA-256", textEncoder.encode(right)),
  ]);
  const a = new Uint8Array(leftHash);
  const b = new Uint8Array(rightHash);
  let difference = 0;
  for (let index = 0; index < a.length; index += 1) difference |= a[index] ^ b[index];
  return difference === 0;
}

function readCookie(request: Request, name: string): string | undefined {
  const cookie = request.headers.get("cookie") ?? "";
  return cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))
    ?.slice(name.length + 1);
}

async function hasValidSession(request: Request, secret: string): Promise<boolean> {
  const value = readCookie(request, SESSION_COOKIE);
  if (!value) return false;
  const separator = value.indexOf(".");
  if (separator < 1) return false;
  const expiry = Number(value.slice(0, separator));
  const payload = value.slice(0, separator);
  const signature = value.slice(separator + 1);
  if (!Number.isSafeInteger(expiry) || expiry <= Math.floor(Date.now() / 1000)) return false;
  return constantTimeEqual(signature, await signSession(payload, secret));
}

function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  return origin === new URL(request.url).origin;
}

function getClientKey(request: Request): string {
  return (
    request.headers.get("x-real-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown"
  );
}

async function readJsonBody<T>(request: Request, maxBytes: number): Promise<T | undefined> {
  if (!request.body) return undefined;
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new Error("Request body too large");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(new TextDecoder().decode(bytes)) as T;
}

function getLoginRateLimit(request: Request): { blocked: boolean; retryAfter: number } {
  const now = Date.now();
  for (const [key, entry] of loginAttempts) {
    if (entry.expiresAt <= now) loginAttempts.delete(key);
  }
  const ip = getClientKey(request);
  const attempt = loginAttempts.get(ip);
  if (!attempt || attempt.expiresAt <= now) return { blocked: false, retryAfter: 0 };
  return {
    blocked: attempt.count >= LOGIN_MAX_ATTEMPTS,
    retryAfter: Math.max(1, Math.ceil((attempt.expiresAt - now) / 1000)),
  };
}

function recordLoginFailure(request: Request) {
  const now = Date.now();
  const ip = getClientKey(request);
  const current = loginAttempts.get(ip);
  loginAttempts.set(ip, {
    count: current && current.expiresAt > now ? current.count + 1 : 1,
    expiresAt: current && current.expiresAt > now ? current.expiresAt : now + LOGIN_WINDOW_MS,
  });
}

function isStaticRequest(pathname: string): boolean {
  return (
    pathname.startsWith("/assets/") ||
    pathname.startsWith("/_build/") ||
    pathname === "/robots.txt" ||
    pathname === "/favicon.ico"
  );
}

function withSecurityHeaders(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set("x-content-type-options", "nosniff");
  headers.set("x-frame-options", "DENY");
  headers.set("referrer-policy", "strict-origin-when-cross-origin");
  headers.set("permissions-policy", "camera=(), microphone=(), geolocation=()");
  if (!headers.has("cache-control")) headers.set("cache-control", "private, no-store");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

async function handleSecurityApi(request: Request, env: RuntimeEnv): Promise<Response | undefined> {
  const url = new URL(request.url);
  const accessPassword = getString(env, "APP_ACCESS_PASSWORD");
  const sessionSecret = getString(env, "APP_SESSION_SECRET");
  const configured = securityConfigured(env);

  if (url.pathname === "/api/auth/status" && request.method === "GET") {
    const authenticated = configured && (await hasValidSession(request, sessionSecret!));
    return jsonResponse({ setupRequired: !configured, authenticated });
  }

  if (url.pathname === "/api/auth/login" && request.method === "POST") {
    if (!configured) return jsonResponse({ error: "Sécurité serveur non configurée." }, 503);
    if (!isSameOrigin(request)) return jsonResponse({ error: "Origine refusée." }, 403);
    const rateLimit = getLoginRateLimit(request);
    if (rateLimit.blocked) {
      const response = jsonResponse({ error: "Trop de tentatives. Réessayez plus tard." }, 429);
      response.headers.set("retry-after", String(rateLimit.retryAfter));
      return response;
    }
    if (!(request.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) {
      return jsonResponse({ error: "Type de requête refusé." }, 415);
    }
    const contentLength = Number(request.headers.get("content-length") ?? 0);
    if (contentLength > 4096) return jsonResponse({ error: "Requête trop volumineuse." }, 413);
    let body: { password?: unknown };
    try {
      body = (await readJsonBody<{ password?: unknown }>(request, 4096)) ?? {};
    } catch {
      return jsonResponse({ error: "Requête invalide." }, 400);
    }
    const password = typeof body.password === "string" ? body.password : "";
    if (password.length > 512 || !(await constantTimeEqual(password, accessPassword!))) {
      recordLoginFailure(request);
      return jsonResponse({ error: "Mot de passe incorrect." }, 401);
    }
    loginAttempts.delete(getClientKey(request));
    const expiry = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;
    const payload = String(expiry);
    const token = `${payload}.${await signSession(payload, sessionSecret!)}`;
    const response = jsonResponse({ authenticated: true });
    response.headers.append(
      "set-cookie",
      `${SESSION_COOKIE}=${token}; Path=/; Max-Age=${SESSION_TTL_SECONDS}; HttpOnly; Secure; SameSite=Strict`,
    );
    return response;
  }

  if (url.pathname === "/api/auth/logout" && request.method === "POST") {
    if (!isSameOrigin(request)) return jsonResponse({ error: "Origine refusée." }, 403);
    const response = jsonResponse({ authenticated: false });
    response.headers.append(
      "set-cookie",
      `${SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict`,
    );
    return response;
  }

  if (url.pathname === "/api/analysis" && request.method === "POST") {
    if (!configured) return jsonResponse({ error: "Sécurité serveur non configurée." }, 503);
    if (!isSameOrigin(request)) return jsonResponse({ error: "Origine refusée." }, 403);
    if (!(await hasValidSession(request, sessionSecret!)))
      return jsonResponse({ error: "Session expirée." }, 401);
    const contentLength = Number(request.headers.get("content-length") ?? 0);
    if (contentLength > 8192) return jsonResponse({ error: "Requête trop volumineuse." }, 413);
    let submittedCredentials: { googleAds?: Record<string, unknown> };
    try {
      submittedCredentials =
        (await readJsonBody<{ googleAds?: Record<string, unknown> }>(request, 8192)) ?? {};
    } catch {
      return jsonResponse({ error: "Requête d’analyse invalide." }, 400);
    }
    try {
      const analysisEnv = Object.fromEntries(
        Object.entries(env).filter(
          (entry): entry is [string, string] => typeof entry[1] === "string",
        ),
      );
      const allowedCredentialNames = [
        "GOOGLE_ADS_DEVELOPER_TOKEN",
        "GOOGLE_ADS_CLIENT_ID",
        "GOOGLE_ADS_CLIENT_SECRET",
        "GOOGLE_ADS_REFRESH_TOKEN",
        "GOOGLE_ADS_CUSTOMER_ID",
        "GOOGLE_ADS_LOGIN_CUSTOMER_ID",
      ] as const;
      const submittedGoogleAds = submittedCredentials.googleAds ?? {};
      for (const name of allowedCredentialNames) {
        const value = submittedGoogleAds[name.replace("GOOGLE_ADS_", "").toLowerCase()];
        if (typeof value === "string" && value.trim()) {
          if (value.length > 4096)
            return jsonResponse({ error: "Un champ de connexion est trop long." }, 400);
          analysisEnv[name] = value.trim();
        }
      }
      if (allowedCredentialNames.some((name) => analysisEnv[name])) {
        analysisEnv.ANALYSIS_MODE = "live";
      }
      const dataset = await loadAnalysisData(analysisEnv);
      return jsonResponse({ lps: dataset.lps, connectedSources: dataset.connectedSources });
    } catch (error) {
      console.error("Analysis failed", error);
      return jsonResponse(
        { error: "L’analyse a échoué. Vérifiez les sources configurées côté serveur." },
        502,
      );
    }
  }

  if (url.pathname.startsWith("/api/")) return jsonResponse({ error: "Route introuvable." }, 404);
  return undefined;
}

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  }
  return serverEntryPromise;
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!isH3SwallowedErrorBody(body)) return response;

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function isH3SwallowedErrorBody(body: string): boolean {
  try {
    const payload = JSON.parse(body) as { unhandled?: unknown; message?: unknown };
    return payload.unhandled === true && payload.message === "HTTPError";
  } catch {
    return false;
  }
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    try {
      const pathname = new URL(request.url).pathname;
      const runtimeEnv = runtimeEnvironment(env);
      const securityResponse = await handleSecurityApi(request, runtimeEnv);
      if (securityResponse) return withSecurityHeaders(securityResponse);

      if (
        !isStaticRequest(pathname) &&
        !(pathname === "/login" && ["GET", "HEAD"].includes(request.method))
      ) {
        if (!securityConfigured(runtimeEnv)) {
          return withSecurityHeaders(Response.redirect(new URL("/login", request.url), 302));
        }
        const secret = getString(runtimeEnv, "APP_SESSION_SECRET")!;
        if (!(await hasValidSession(request, secret))) {
          if (pathname.startsWith("/api/"))
            return withSecurityHeaders(jsonResponse({ error: "Session expirée." }, 401));
          return withSecurityHeaders(Response.redirect(new URL("/login", request.url), 302));
        }
      }

      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      return withSecurityHeaders(await normalizeCatastrophicSsrResponse(response));
    } catch (error) {
      console.error(error);
      return withSecurityHeaders(
        new Response(renderErrorPage(), {
          status: 500,
          headers: { "content-type": "text/html; charset=utf-8" },
        }),
      );
    }
  },
};
