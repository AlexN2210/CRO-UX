export type ProductionMode = "demo" | "hybrid" | "live";

export interface ProductionConfig {
  mode: ProductionMode;
  googleAdsApiUrl?: string;
  shopifyApiUrl?: string;
  googleAnalyticsApiUrl?: string;
  searchConsoleApiUrl?: string;
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

export function getProductionConfig(env: Record<string, string | undefined> = (globalThis as any).importMeta?.env ?? {}): ProductionConfig {
  const mode = (env.VITE_ANALYSIS_MODE ?? "demo").toLowerCase();

  return {
    mode: validModes.includes(mode as ProductionMode) ? (mode as ProductionMode) : "demo",
    googleAdsApiUrl: env.VITE_GOOGLE_ADS_API_URL || undefined,
    shopifyApiUrl: env.VITE_SHOPIFY_API_URL || undefined,
    googleAnalyticsApiUrl: env.VITE_GA4_API_URL || undefined,
    searchConsoleApiUrl: env.VITE_SEARCH_CONSOLE_API_URL || undefined,
    analysisBatchSize: Number(env.VITE_ANALYSIS_BATCH_SIZE ?? 50),
    enableAutoAnalysis: env.VITE_ENABLE_AUTO_ANALYSIS !== "false",
  };
}

export function getDataSources(config: ProductionConfig): ProductionDataSource[] {
  return [
    { name: "Google Ads", url: config.googleAdsApiUrl, configured: Boolean(config.googleAdsApiUrl) },
    { name: "Shopify Admin", url: config.shopifyApiUrl, configured: Boolean(config.shopifyApiUrl) },
    { name: "Google Analytics 4", url: config.googleAnalyticsApiUrl, configured: Boolean(config.googleAnalyticsApiUrl) },
    { name: "Search Console", url: config.searchConsoleApiUrl, configured: Boolean(config.searchConsoleApiUrl) },
  ];
}

export function resolveProductionStatus(config: ProductionConfig) {
  const dataSources = getDataSources(config);
  const configured = dataSources.filter((source) => source.configured);

  return {
    readyForProduction: configured.length >= 2,
    mode: config.mode,
    configuredSources: configured.map((source) => source.name),
    missingSources: dataSources.filter((source) => !source.configured).map((source) => source.name),
  };
}

export function createAnalysisPlan<T extends { id?: number; url?: string; scoreGlobal?: number; priority?: string; spend?: number; template?: string }>(
  lps: T[],
  config: ProductionConfig = getProductionConfig(),
): AnalysisPlan {
  const prioritized = [...lps]
    .filter((lp) => typeof lp.url === "string" && lp.url.length > 0)
    .sort((a, b) => (Number(b.scoreGlobal ?? 0) - Number(a.scoreGlobal ?? 0)))
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
