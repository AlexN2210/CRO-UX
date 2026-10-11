import { getLPs, type LP } from "./data";
import { getProductionConfig, resolveProductionStatus, type ProductionConfig } from "./production";

export type AnalysisDataset = {
  mode: ProductionConfig["mode"];
  lps: LP[];
  connectedSources: string[];
  status: ReturnType<typeof resolveProductionStatus>;
};

async function fetchJson<T>(url: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      ...(typeof init.headers === "object" ? init.headers : {}),
      Accept: "application/json",
    },
  });
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status} ${response.statusText}`);
  }
  return (await response.json()) as T;
}

function getSourceHeaders(config: ProductionConfig, name: string): Record<string, string> {
  const headers: Record<string, string> = { Accept: "application/json" };

  if (name === "Google Ads" && config.googleAdsApiKey) {
    headers.Authorization = `Bearer ${config.googleAdsApiKey}`;
    headers["X-API-Key"] = config.googleAdsApiKey;
  }

  if (name === "Shopify Admin" && config.shopifyAccessToken) {
    headers["X-Shopify-Access-Token"] = config.shopifyAccessToken;
    headers.Authorization = `Bearer ${config.shopifyAccessToken}`;
  }

  if (name === "Google Analytics 4" && config.googleAnalyticsApiKey) {
    headers.Authorization = `Bearer ${config.googleAnalyticsApiKey}`;
  }

  if (name === "Search Console" && config.searchConsoleApiKey) {
    headers.Authorization = `Bearer ${config.searchConsoleApiKey}`;
    headers["X-API-Key"] = config.searchConsoleApiKey;
  }

  return headers;
}

function normalizeLps(payload: unknown): LP[] {
  if (Array.isArray(payload)) {
    return payload as LP[];
  }

  if (payload && typeof payload === "object") {
    const maybe = payload as { lps?: unknown; landingPages?: unknown; data?: unknown };
    if (Array.isArray(maybe.lps)) return maybe.lps as LP[];
    if (Array.isArray(maybe.landingPages)) return maybe.landingPages as LP[];
    if (Array.isArray(maybe.data)) return maybe.data as LP[];
  }

  return [];
}

function validateSourceUrl(url: string, allowedHosts: string[]) {
  const parsed = new URL(url);
  if (parsed.protocol !== "https:" || !allowedHosts.includes(parsed.hostname.toLowerCase())) {
    throw new Error("Source API URL rejected: use HTTPS and a host in DATA_API_ALLOWED_HOSTS.");
  }
}

export function getDataSourceStatus(env: Record<string, string | undefined> = {}) {
  const config = getProductionConfig(env);
  const status = resolveProductionStatus(config);

  return {
    ...status,
    statusLabel: status.readyForProduction ? "connecté" : "démo",
    mode: config.mode,
  };
}

export async function loadAnalysisData(
  env: Record<string, string | undefined> = {},
): Promise<AnalysisDataset> {
  const config = getProductionConfig(env);
  const status = resolveProductionStatus(config);
  const connectedSources = status.configuredSources;

  if (!status.readyForProduction) {
    if (config.mode === "live") {
      throw new Error(
        "Le mode live exige au moins deux sources configurées avec URL et credential côté serveur.",
      );
    }
    return {
      mode: config.mode,
      lps: getLPs(),
      connectedSources: [],
      status,
    };
  }

  const sourcesToTry = [
    { name: "Google Ads", url: config.googleAdsApiUrl },
    { name: "Shopify Admin", url: config.shopifyApiUrl },
    { name: "Google Analytics 4", url: config.googleAnalyticsApiUrl },
    { name: "Search Console", url: config.searchConsoleApiUrl },
  ].filter((source) => Boolean(source.url));

  const resolved: LP[] = [];
  const allowedHosts = (env.DATA_API_ALLOWED_HOSTS ?? "")
    .split(",")
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean);
  const failures: string[] = [];

  for (const source of sourcesToTry) {
    try {
      validateSourceUrl(source.url!, allowedHosts);
      const json = await fetchJson<unknown>(source.url!, {
        headers: getSourceHeaders(config, source.name),
      });
      const lps = normalizeLps(json);
      if (lps.length > 0) {
        resolved.push(...lps);
      }
    } catch (error) {
      failures.push(error instanceof Error ? error.message : "Source API request failed.");
    }
  }

  if (resolved.length === 0 && config.mode === "live") {
    throw new Error(failures[0] ?? "Aucune donnée LP valide reçue des sources configurées.");
  }

  return {
    mode: config.mode,
    lps: resolved.length > 0 ? resolved : getLPs(),
    connectedSources,
    status,
  };
}
