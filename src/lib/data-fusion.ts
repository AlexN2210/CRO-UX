import { getLPs, priorityOf, scoreCRO, scoreSEA, scoreShopify, globalScore, type LP } from "./data";

export type GoogleAdsFusionRow = {
  url: string;
  campaign?: string;
  adGroup?: string;
  spend?: number;
  impressions?: number;
  clicks?: number;
  conversions?: number;
  ctr?: number;
  cvr?: number;
  cpc?: number;
  qs?: number;
  lpExp?: LP["lpExp"];
  keywords?: string[];
  scoreSEA?: number;
  dataCoverage?: LP["dataCoverage"];
};

export type ShopifyFusionRow = {
  url: string;
  template?: string;
  shopSections?: string[];
  metafields?: number;
  dynamicSections?: number;
  ctaCount?: number;
  ctaAboveFold?: boolean;
  h2Count?: number;
  reassurance?: boolean;
  sections?: number;
  scrollDepth?: number;
  h1?: string;
  loadTime?: number;
  assetWeight?: number;
};

export type Ga4FusionRow = {
  url: string;
  sessions?: number;
  pageviews?: number;
  conversions?: number;
  cvRate?: number;
  revenue?: number;
  engagementRate?: number;
};

export type SpeedFusionRow = {
  url: string;
  lcp?: number;
  cls?: number;
  inp?: number;
};

export function buildUnifiedLpDataset(input: {
  googleAds?: GoogleAdsFusionRow[];
  shopify?: ShopifyFusionRow[];
  ga4?: Ga4FusionRow[];
  speed?: SpeedFusionRow[];
}): LP[] {
  const byUrl = new Map<string, Partial<LP>>();

  const seed = (): Partial<LP> => ({
    ...getLPs()[0],
    id: 0,
    url: "",
    dataCoverage: "demo",
    campaign: "Fusion des sources",
    adGroup: "Non disponible",
    spend: 0,
    impressions: 0,
    clicks: 0,
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
    dynamicSections: 0,
    scoreSEA: 0,
    scoreCRO: 0,
    scoreShopify: 0,
    scoreGlobal: 0,
    priority: "P3",
  });

  const ensure = (url: string): Partial<LP> => {
    const current = byUrl.get(url);
    if (current) return current;
    const created = seed();
    created.url = url;
    byUrl.set(url, created);
    return created;
  };

  for (const row of input.googleAds ?? []) {
    const record = ensure(row.url);
    record.url = row.url;
    record.dataCoverage = row.dataCoverage ?? "sea-only";
    record.campaign = row.campaign ?? record.campaign ?? "Google Ads";
    record.adGroup = row.adGroup ?? record.adGroup ?? "Non disponible";
    record.spend = row.spend ?? record.spend ?? 0;
    record.impressions = row.impressions ?? record.impressions ?? 0;
    record.clicks = row.clicks ?? record.clicks ?? 0;
    record.conversions = row.conversions ?? record.conversions ?? 0;
    record.ctr = row.ctr ?? record.ctr ?? 0;
    record.cvr = row.cvr ?? record.cvr ?? 0;
    record.cpc = row.cpc ?? record.cpc ?? 0;
    record.qs = row.qs ?? record.qs ?? 0;
    record.lpExp = row.lpExp ?? record.lpExp ?? "Moyenne";
    record.keywords = row.keywords ?? record.keywords ?? [];
    record.scoreSEA = row.scoreSEA ?? record.scoreSEA ?? 0;
  }

  for (const row of input.shopify ?? []) {
    const record = ensure(row.url);
    record.template = row.template ?? record.template ?? "Non analysé";
    record.shopSections = row.shopSections ?? record.shopSections ?? [];
    record.metafields = row.metafields ?? record.metafields ?? 0;
    record.dynamicSections = row.dynamicSections ?? record.dynamicSections ?? 0;
    record.ctaCount = row.ctaCount ?? record.ctaCount ?? 0;
    record.ctaAboveFold = row.ctaAboveFold ?? record.ctaAboveFold ?? false;
    record.h2Count = row.h2Count ?? record.h2Count ?? 0;
    record.reassurance = row.reassurance ?? record.reassurance ?? false;
    record.sections = row.sections ?? record.sections ?? 0;
    record.scrollDepth = row.scrollDepth ?? record.scrollDepth ?? 0;
    record.h1 = row.h1 ?? record.h1 ?? "";
    record.loadTime = row.loadTime ?? record.loadTime ?? 0;
    record.assetWeight = row.assetWeight ?? record.assetWeight ?? 0;
  }

  for (const row of input.ga4 ?? []) {
    const record = ensure(row.url);
    record.sessions = row.sessions ?? record.sessions ?? 0;
    record.pageviews = row.pageviews ?? record.pageviews ?? 0;
    record.conversions = row.conversions ?? record.conversions ?? 0;
    record.cvr = row.cvRate ?? record.cvr ?? 0;
    record.revenue = row.revenue ?? record.revenue ?? 0;
    record.engagementRate = row.engagementRate ?? record.engagementRate ?? 0;
  }

  for (const row of input.speed ?? []) {
    const record = ensure(row.url);
    const lcp = row.lcp ?? 0;
    const inp = row.inp ?? 0;
    const cls = row.cls ?? 0;
    record.loadTime = lcp || record.loadTime || 0;
    record.lhPerf = Math.max(0, 100 - Math.min(100, (lcp * 18 + inp * 0.12 + cls * 1200)));
    record.lhA11y = record.lhA11y ?? 70;
    record.lhBP = record.lhBP ?? 70;
    record.lhSEO = record.lhSEO ?? 70;
  }

  const urls = [...byUrl.keys()];
  const maxSpend = Math.max(1, ...urls.map((url) => byUrl.get(url)?.spend ?? 0));

  return urls.map((url, index) => {
    const lp = byUrl.get(url)!;
    const spend = lp.spend ?? 0;
    const qs = lp.qs ?? 0;
    const cvr = lp.cvr ?? 0;
    const ctr = lp.ctr ?? 0;
    const selectedTemplate = lp.template ?? "Non analysé";
    const templateShare = selectedTemplate === "Non analysé" ? 0 : 1;
    const dynamicSections = lp.dynamicSections ?? 0;
    const metafields = lp.metafields ?? 0;
    const legacy = selectedTemplate === "page.custom-legacy";
    const ctaCount = lp.ctaCount ?? 0;
    const ctaAboveFold = lp.ctaAboveFold ?? false;
    const scrollDepth = lp.scrollDepth ?? 0;
    const h2Count = lp.h2Count ?? 0;
    const reassurance = lp.reassurance ?? false;
    const sections = lp.sections ?? 0;

    const seaScore = lp.scoreSEA && lp.scoreSEA > 0
      ? lp.scoreSEA
      : scoreSEA(
          {
            spend,
            qs,
            lpExp: lp.lpExp ?? "Moyenne",
            cvr,
            coherence: lp.coherence ?? 60,
          },
          maxSpend,
        );

    const croScore = scoreCRO({
      ctaCount,
      ctaAboveFold,
      lhPerf: lp.lhPerf ?? 70,
      scrollDepth,
      h2Count,
      reassurance,
      sections,
    });

    const shopScore = scoreShopify(
      templateShare,
      dynamicSections,
      metafields,
      legacy,
    );

    const global = globalScore(seaScore, croScore, shopScore);
    const finalLp: LP = {
      ...getLPs()[0],
      ...lp,
      id: index + 1,
      url,
      dataCoverage: lp.dataCoverage ?? "demo",
      campaign: lp.campaign ?? "Fusion des sources",
      adGroup: lp.adGroup ?? "Non disponible",
      spend,
      impressions: lp.impressions ?? 0,
      clicks: lp.clicks ?? 0,
      conversions: lp.conversions ?? 0,
      qs,
      lpExp: lp.lpExp ?? "Moyenne",
      ctr,
      cvr,
      cpc: lp.cpc ?? (lp.clicks && lp.clicks > 0 ? spend / lp.clicks : 0),
      keywords: lp.keywords ?? [],
      coherence: lp.coherence ?? 60,
      h1: lp.h1 ?? "",
      h2Count,
      ctaCount,
      ctaAboveFold,
      sections,
      reassurance,
      scrollDepth,
      loadTime: lp.loadTime ?? 0,
      assetWeight: lp.assetWeight ?? 0,
      lhPerf: lp.lhPerf ?? 70,
      lhA11y: lp.lhA11y ?? 70,
      lhBP: lp.lhBP ?? 70,
      lhSEO: lp.lhSEO ?? 70,
      template: selectedTemplate,
      shopSections: lp.shopSections ?? [],
      metafields,
      dynamicSections,
      scoreSEA: seaScore,
      scoreCRO: croScore,
      scoreShopify: shopScore,
      scoreGlobal: global,
      priority: priorityOf(global),
    };

    return finalLp;
  });
}
