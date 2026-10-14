export type ProductionMode = "demo" | "hybrid" | "live";

export interface ProductionConfig {
  mode: ProductionMode;
  googleAdsApiVersion: string;
  googleAdsDeveloperToken?: string;
  googleAdsClientId?: string;
  googleAdsClientSecret?: string;
  googleAdsRefreshToken?: string;
  googleAdsCustomerId?: string;
  googleAdsLoginCustomerId?: string;
  shopifyAdapterUrl?: string;
  shopifyAdapterToken?: string;
  googleAnalyticsAdapterUrl?: string;
  googleAnalyticsAdapterToken?: string;
  searchConsoleAdapterUrl?: string;
  searchConsoleAdapterToken?: string;
  analysisBatchSize: number;
  enableAutoAnalysis: boolean;
}

export interface ProductionDataSource {
  name: string;
  url?: string;
  configured: boolean;
}

export interface AnalysisPlan {
  sourceMode: ProductionMode;
  readyForProduction: boolean;
  steps: string[];
  prioritized: Array<{
    id: number;
    url: string;
    scoreGlobal: number;
    priority: string;
    spend: number;
    template: string;
  }>;
  byTemplate: Record<string, number>;
}

const validModes: ProductionMode[] = ["demo", "hybrid", "live"];

function sanitizeString(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized && normalized.length > 0 ? normalized : undefined;
}

export function getProductionConfig(
  env: Record<string, string | undefined> = {},
): ProductionConfig {
  const mode = (env.ANALYSIS_MODE ?? "demo").toLowerCase();
  const normalizedMode = validModes.includes(mode as ProductionMode)
    ? (mode as ProductionMode)
    : "demo";

  return {
    mode: normalizedMode,
    googleAdsApiVersion: sanitizeString(env.GOOGLE_ADS_API_VERSION) ?? "v25",
    googleAdsDeveloperToken: sanitizeString(env.GOOGLE_ADS_DEVELOPER_TOKEN),
    googleAdsClientId: sanitizeString(env.GOOGLE_ADS_CLIENT_ID),
    googleAdsClientSecret: sanitizeString(env.GOOGLE_ADS_CLIENT_SECRET),
    googleAdsRefreshToken: sanitizeString(env.GOOGLE_ADS_REFRESH_TOKEN),
    googleAdsCustomerId: sanitizeString(env.GOOGLE_ADS_CUSTOMER_ID),
    googleAdsLoginCustomerId: sanitizeString(env.GOOGLE_ADS_LOGIN_CUSTOMER_ID),
    shopifyAdapterUrl: sanitizeString(env.SHOPIFY_ADAPTER_URL),
    shopifyAdapterToken: sanitizeString(env.SHOPIFY_ADAPTER_TOKEN),
    googleAnalyticsAdapterUrl: sanitizeString(env.GA4_ADAPTER_URL),
    googleAnalyticsAdapterToken: sanitizeString(env.GA4_ADAPTER_TOKEN),
    searchConsoleAdapterUrl: sanitizeString(env.SEARCH_CONSOLE_ADAPTER_URL),
    searchConsoleAdapterToken: sanitizeString(env.SEARCH_CONSOLE_ADAPTER_TOKEN),
    analysisBatchSize: Number(env.ANALYSIS_BATCH_SIZE ?? 50),
    enableAutoAnalysis: env.ENABLE_AUTO_ANALYSIS !== "false",
  };
}

export function getDataSources(config: ProductionConfig): ProductionDataSource[] {
  return [
    {
      name: "Google Ads",
      configured: Boolean(
        config.googleAdsDeveloperToken &&
        config.googleAdsClientId &&
        config.googleAdsClientSecret &&
        config.googleAdsRefreshToken &&
        config.googleAdsCustomerId,
      ),
    },
    {
      name: "Shopify Admin",
      url: config.shopifyAdapterUrl,
      configured: Boolean(config.shopifyAdapterUrl && config.shopifyAdapterToken),
    },
    {
      name: "Google Analytics 4",
      url: config.googleAnalyticsAdapterUrl,
      configured: Boolean(config.googleAnalyticsAdapterUrl && config.googleAnalyticsAdapterToken),
    },
    {
      name: "Search Console",
      url: config.searchConsoleAdapterUrl,
      configured: Boolean(config.searchConsoleAdapterUrl && config.searchConsoleAdapterToken),
    },
  ];
}

export function resolveProductionStatus(config: ProductionConfig) {
  const dataSources = getDataSources(config);
  const configured = dataSources.filter((source) => source.configured);

  return {
    readyForProduction: configured.length >= 1,
    mode: config.mode,
    configuredSources: configured.map((source) => source.name),
    missingSources: dataSources.filter((source) => !source.configured).map((source) => source.name),
  };
}

export function createAnalysisPlan<
  T extends {
    id?: number;
    url?: string;
    scoreGlobal?: number;
    priority?: string;
    spend?: number;
    template?: string;
  },
>(lps: T[], config: ProductionConfig = getProductionConfig()): AnalysisPlan {
  const prioritized = [...lps]
    .filter((lp) => typeof lp.url === "string" && lp.url.length > 0)
    .sort((a, b) => Number(b.scoreGlobal ?? 0) - Number(a.scoreGlobal ?? 0))
    .slice(0, Math.min(10, lps.length))
    .map((lp) => ({
      id: Number(lp.id ?? 0),
      url: lp.url ?? "/pages/inconnu",
      scoreGlobal: Number(lp.scoreGlobal ?? 0),
      priority: lp.priority ?? "P3",
      spend: Number(lp.spend ?? 0),
      template: lp.template ?? "page.custom-legacy",
    }));

  const byTemplate = lps.reduce<Record<string, number>>((acc, lp) => {
    const key = lp.template ?? "page.custom-legacy";
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});

  const steps = ["Analyse SEA", "Audit CRO/UX", "Analyse Shopify", "Recommandation", "Devis"];
  const status = resolveProductionStatus(config);

  return {
    sourceMode: config.mode,
    readyForProduction: status.readyForProduction,
    steps,
    prioritized,
    byTemplate,
  };
}
