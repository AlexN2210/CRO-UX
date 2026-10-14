import { getLPs, priorityOf, type LP } from "./data";
import { buildUnifiedLpDataset } from "./data-fusion";
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

type GoogleAdsApiRow = {
  landingPageView?: { unexpandedFinalUrl?: string };
  campaign?: { name?: string };
  adGroup?: { name?: string };
  metrics?: {
    clicks?: string | number;
    impressions?: string | number;
    costMicros?: string | number;
    conversions?: string | number;
    ctr?: string | number;
    averageCpc?: string | number;
  };
};

function numberValue(value: string | number | undefined): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function getGoogleAdsRows(payload: unknown): GoogleAdsApiRow[] {
  const batches = Array.isArray(payload) ? payload : [payload];
  return batches.flatMap((batch) => {
    if (!batch || typeof batch !== "object") return [];
    const results = (batch as { results?: unknown }).results;
    return Array.isArray(results) ? (results as GoogleAdsApiRow[]) : [];
  });
}

export function mapGoogleAdsRowsToLPs(rows: GoogleAdsApiRow[]): LP[] {
  const grouped = new Map<
    string,
    {
      spendMicros: number;
      clicks: number;
      impressions: number;
      conversions: number;
      campaigns: Set<string>;
      adGroups: Set<string>;
    }
  >();

  for (const row of rows) {
    const rawUrl = row.landingPageView?.unexpandedFinalUrl;
    if (!rawUrl) continue;
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(rawUrl);
    } catch {
      continue;
    }
    if (parsedUrl.protocol !== "https:" && parsedUrl.protocol !== "http:") continue;
    const url = parsedUrl.toString();
    const current = grouped.get(url) ?? {
      spendMicros: 0,
      clicks: 0,
      impressions: 0,
      conversions: 0,
      campaigns: new Set<string>(),
      adGroups: new Set<string>(),
    };
    current.spendMicros += numberValue(row.metrics?.costMicros);
    current.clicks += numberValue(row.metrics?.clicks);
    current.impressions += numberValue(row.metrics?.impressions);
    current.conversions += numberValue(row.metrics?.conversions);
    if (row.campaign?.name) current.campaigns.add(row.campaign.name);
    if (row.adGroup?.name) current.adGroups.add(row.adGroup.name);
    grouped.set(url, current);
  }

  const rawPages = [...grouped.entries()].map(([url, metrics], index) => {
    const spend = metrics.spendMicros / 1_000_000;
    const ctr = metrics.impressions > 0 ? (metrics.clicks / metrics.impressions) * 100 : 0;
    const cvr = metrics.clicks > 0 ? (metrics.conversions / metrics.clicks) * 100 : 0;
    const cpc = metrics.clicks > 0 ? spend / metrics.clicks : 0;
    return {
      id: index + 1,
      url,
      dataCoverage: "sea-only" as const,
      campaign: [...metrics.campaigns].join(" · ") || "Google Ads",
      adGroup: [...metrics.adGroups].join(" · ") || "Non disponible",
      spend,
      impressions: metrics.impressions,
      clicks: metrics.clicks,
      qs: 0,
      lpExp: "Moyenne" as const,
      ctr,
      cvr,
      cpc,
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
      dynamicSections: 0,
      conversions: metrics.conversions,
      scoreSEA: 0,
      scoreCRO: 0,
      scoreShopify: 0,
      scoreGlobal: 0,
      priority: "P3" as const,
    };
  });

  const maxSpend = Math.max(1, ...rawPages.map((page) => page.spend));
  return rawPages.map((page) => {
    const spendOpportunity = (page.spend / maxSpend) * 70;
    const ctrOpportunity = Math.max(0, 100 - page.ctr * 10) * 0.15;
    const conversionOpportunity = Math.max(0, 100 - page.cvr * 10) * 0.15;
    const sea = Math.round(
      Math.min(100, spendOpportunity + ctrOpportunity + conversionOpportunity),
    );
    return {
      ...page,
      scoreSEA: sea,
      scoreGlobal: sea,
      priority: priorityOf(sea),
    };
  });
}

export async function fetchGoogleAdsLandingPages(
  config: ProductionConfig,
  fetcher: typeof fetch = fetch,
): Promise<LP[]> {
  if (
    !config.googleAdsDeveloperToken ||
    !config.googleAdsClientId ||
    !config.googleAdsClientSecret ||
    !config.googleAdsRefreshToken ||
    !config.googleAdsCustomerId
  ) {
    throw new Error("Google Ads OAuth credentials are incomplete.");
  }

  const customerId = config.googleAdsCustomerId.replaceAll("-", "");
  if (!/^\d{10}$/u.test(customerId)) {
    throw new Error("Google Ads Customer ID must contain 10 digits.");
  }
  if (!/^v\d{1,3}$/u.test(config.googleAdsApiVersion)) {
    throw new Error("Google Ads API version must use format vNN.");
  }

  const tokenResponse = await fetcher("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
    body: new URLSearchParams({
      client_id: config.googleAdsClientId,
      client_secret: config.googleAdsClientSecret,
      refresh_token: config.googleAdsRefreshToken,
      grant_type: "refresh_token",
    }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!tokenResponse.ok) {
    throw new Error(`Google OAuth token refresh failed (${tokenResponse.status}).`);
  }
  const tokenPayload = (await tokenResponse.json()) as { access_token?: unknown };
  if (typeof tokenPayload.access_token !== "string" || !tokenPayload.access_token) {
    throw new Error("Google OAuth response did not contain an access token.");
  }

  const query = `SELECT landing_page_view.unexpanded_final_url, campaign.name, ad_group.name, metrics.clicks, metrics.impressions, metrics.cost_micros, metrics.conversions, metrics.ctr, metrics.average_cpc FROM landing_page_view WHERE segments.date DURING LAST_30_DAYS`;
  const headers: Record<string, string> = {
    authorization: `Bearer ${tokenPayload.access_token}`,
    "content-type": "application/json",
    "developer-token": config.googleAdsDeveloperToken,
  };
  if (config.googleAdsLoginCustomerId) {
    headers["login-customer-id"] = config.googleAdsLoginCustomerId.replaceAll("-", "");
  }

  const response = await fetcher(
    `https://googleads.googleapis.com/${config.googleAdsApiVersion}/customers/${customerId}/googleAds:searchStream`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({ query }),
      signal: AbortSignal.timeout(30_000),
    },
  );
  if (!response.ok) {
    throw new Error(`Google Ads API request failed (${response.status}).`);
  }

  const rows = getGoogleAdsRows(await response.json());
  const lps = mapGoogleAdsRowsToLPs(rows);
  if (lps.length === 0) {
    throw new Error("Google Ads returned no valid landing page URLs for the last 30 days.");
  }
  return lps;
}

function getSourceHeaders(config: ProductionConfig, name: string): Record<string, string> {
  const headers: Record<string, string> = { Accept: "application/json" };
  const adapterToken =
    name === "Shopify Admin"
      ? config.shopifyAdapterToken
      : name === "Google Analytics 4"
        ? config.googleAnalyticsAdapterToken
        : config.searchConsoleAdapterToken;
  if (adapterToken) {
    headers.Authorization = `Bearer ${adapterToken}`;
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
    statusLabel: status.configuredSources.length > 0 ? "configuré" : "démo",
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
      throw new Error("Le mode live exige au moins une source complète configurée côté serveur.");
    }
    return {
      mode: config.mode,
      lps: getLPs(),
      connectedSources: [],
      status,
    };
  }

  const sourcesToTry = [
    { name: "Shopify Admin", url: config.shopifyAdapterUrl },
    { name: "Google Analytics 4", url: config.googleAnalyticsAdapterUrl },
    { name: "Search Console", url: config.searchConsoleAdapterUrl },
  ].filter((source) => Boolean(source.url));

  const resolved: LP[] = [];
  const successfulSources: string[] = [];
  let googleAdsPayload: LP[] = [];
  let shopifyPayload: LP[] = [];
  let ga4Payload: LP[] = [];
  const speedPayload: Array<{ url: string; lcp?: number; cls?: number; inp?: number }> = [];
  const allowedHosts = (env.DATA_API_ALLOWED_HOSTS ?? "")
    .split(",")
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean);
  const failures: string[] = [];

  if (status.configuredSources.includes("Google Ads")) {
    try {
      const googleAdsRows = await fetchGoogleAdsLandingPages(config);
      googleAdsPayload = googleAdsRows;
      resolved.push(...googleAdsRows);
      successfulSources.push("Google Ads");
    } catch (error) {
      failures.push(error instanceof Error ? error.message : "Google Ads request failed.");
    }
  }

  for (const source of sourcesToTry) {
    try {
      validateSourceUrl(source.url!, allowedHosts);
      const json = await fetchJson<unknown>(source.url!, {
        headers: getSourceHeaders(config, source.name),
      });
      const lps = normalizeLps(json);
      if (lps.length > 0) {
        resolved.push(...lps);
        successfulSources.push(source.name);
        if (source.name === "Shopify Admin") {
          shopifyPayload = lps;
        }
        if (source.name === "Google Analytics 4") {
          ga4Payload = lps;
        }
      }
    } catch (error) {
      failures.push(error instanceof Error ? error.message : "Source API request failed.");
    }
  }

  if (resolved.length === 0 && config.mode === "live") {
    throw new Error(failures[0] ?? "Aucune donnée LP valide reçue des sources configurées.");
  }

  const merged =
    successfulSources.length > 1
      ? buildUnifiedLpDataset({
          googleAds: googleAdsPayload,
          shopify: shopifyPayload,
          ga4: ga4Payload,
          speed: speedPayload,
        })
      : resolved;

  return {
    mode: config.mode,
    lps: merged.length > 0 ? merged : getLPs(),
    connectedSources: resolved.length > 0 ? successfulSources : [],
    status,
  };
}
