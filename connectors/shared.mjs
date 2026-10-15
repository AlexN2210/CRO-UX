import { timingSafeEqual } from "node:crypto";

export function canonicalPath(value, baseUrl) {
  try {
    const parsed = new URL(value, baseUrl);
    const pathname = parsed.pathname.replace(/\/+$/u, "") || "/";
    return pathname;
  } catch {
    return undefined;
  }
}

export function getAllowedStorefrontHosts(siteUrl, additionalHosts = "") {
  const hostname = new URL(siteUrl).hostname.toLowerCase();
  const hosts = new Set([hostname]);
  const rootHost = hostname.replace(/^(?:shop|www)\./u, "");
  if (rootHost !== hostname) {
    hosts.add(rootHost);
    hosts.add(`shop.${rootHost}`);
    hosts.add(`www.${rootHost}`);
  }
  for (const host of additionalHosts.split(",").map((value) => value.trim().toLowerCase())) {
    if (host) hosts.add(host);
  }
  return hosts;
}

export function normalizeTargetUrls(values, siteUrl, maximum = 100, allowedHosts = new Set()) {
  const site = new URL(siteUrl);
  const allowed = new Set([site.hostname.toLowerCase(), ...allowedHosts]);
  const uniqueUrls = new Set();
  for (const value of Array.isArray(values) ? values : []) {
    if (typeof value !== "string") continue;
    try {
      const parsed = new URL(value, site);
      if (!allowed.has(parsed.hostname.toLowerCase())) continue;
      parsed.protocol = site.protocol;
      parsed.host = site.host;
      parsed.username = "";
      parsed.password = "";
      uniqueUrls.add(parsed.href);
    } catch {
      continue;
    }
  }
  return [...uniqueUrls].slice(0, maximum);
}

export function lpRecord(url, values = {}) {
  return {
    id: 0,
    url,
    dataCoverage: "multi-source",
    campaign: "Non disponible",
    adGroup: "Non disponible",
    spend: 0,
    impressions: 0,
    clicks: 0,
    conversions: 0,
    qs: 0,
    lpExp: "Moyenne",
    ctr: 0,
    cvr: 0,
    cpc: 0,
    keywords: [],
    coherence: 0,
    h1: "",
    h2Count: 0,
    ctaCount: 0,
    ctaAboveFold: false,
    sections: 0,
    reassurance: false,
    scrollDepth: 0,
    loadTime: 0,
    assetWeight: 0,
    lhPerf: 0,
    lhA11y: 0,
    lhBP: 0,
    lhSEO: 0,
    template: "Non analysé",
    shopSections: [],
    metafields: 0,
    metafieldsAvailable: false,
    dynamicSections: 0,
    scoreSEA: 0,
    scoreCRO: 0,
    scoreShopify: 0,
    scoreGlobal: 0,
    priority: "P3",
    ...values,
  };
}

export function hasBearerToken(request, expected) {
  if (!expected) return false;
  const authorization = request.headers?.get?.("authorization") ?? request.headers?.authorization;
  if (typeof authorization !== "string" || !/^Bearer\s+/iu.test(authorization)) return false;
  const supplied = authorization.replace(/^Bearer\s+/iu, "").trim();
  const suppliedBuffer = Buffer.from(supplied);
  const expectedBuffer = Buffer.from(expected);
  return (
    suppliedBuffer.length === expectedBuffer.length &&
    timingSafeEqual(suppliedBuffer, expectedBuffer)
  );
}

export async function readJsonBody(request, maxBytes = 1_000_000) {
  const chunks = [];
  let size = 0;
  if (typeof request[Symbol.asyncIterator] === "function") {
    for await (const chunk of request) {
      size += chunk.length;
      if (size > maxBytes) throw new Error("Request body too large");
      chunks.push(chunk);
    }
  } else {
    const body = Buffer.from(await request.arrayBuffer());
    if (body.length > maxBytes) throw new Error("Request body too large");
    chunks.push(body);
    size = body.length;
  }
  if (size === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

export function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  response.end(JSON.stringify(payload));
}
