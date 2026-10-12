// Deterministic demo dataset (184 landing pages) + scoring/recommendation logic.

export type LP = {
  id: number;
  url: string;
  dataCoverage?: "demo" | "sea-only";
  conversions?: number;
  campaign: string;
  adGroup: string;
  // SEA
  spend: number;
  impressions: number;
  clicks: number;
  qs: number;
  lpExp: "Au-dessus" | "Moyenne" | "En dessous";
  ctr: number;
  cvr: number;
  cpc: number;
  keywords: string[];
  coherence: number;
  // CRO/UX
  h1: string;
  h2Count: number;
  ctaCount: number;
  ctaAboveFold: boolean;
  sections: number;
  reassurance: boolean;
  scrollDepth: number;
  loadTime: number;
  assetWeight: number;
  lhPerf: number;
  lhA11y: number;
  lhBP: number;
  lhSEO: number;
  // Shopify
  template: string;
  shopSections: string[];
  metafields: number;
  dynamicSections: number;
  // Scores
  scoreSEA: number;
  scoreCRO: number;
  scoreShopify: number;
  scoreGlobal: number;
  priority: "P1" | "P2" | "P3";
};

function rng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

const clamp = (v: number, a = 0, b = 100) => Math.max(a, Math.min(b, v));

export const TEMPLATES = [
  "page.landing-produit",
  "page.landing-collection",
  "page.landing-promo",
  "page.landing-guide",
  "page.custom-legacy",
  "page.landing-b2b",
];
const SECTIONS = [
  "hero",
  "usp-bar",
  "product-grid",
  "testimonials",
  "faq",
  "rich-text",
  "image-banner",
  "comparison",
  "cta-banner",
  "newsletter",
];
const CAMPAIGNS = [
  "Search - Marque",
  "Search - Générique",
  "Search - Concurrents",
  "Search - Promo",
  "Search - Catégories",
];
const KW = [
  "chaussures running",
  "basket femme",
  "trail homme",
  "promo sneakers",
  "chaussure randonnée",
  "semelle confort",
  "running pas cher",
  "basket cuir",
  "chaussure sport",
  "trail imperméable",
];
const SLUGS = [
  "running",
  "trail",
  "sneakers",
  "randonnee",
  "promo",
  "femme",
  "homme",
  "enfant",
  "confort",
  "cuir",
  "sport",
  "outlet",
];

export function scoreSEA(
  lp: Pick<LP, "spend" | "qs" | "lpExp" | "cvr" | "coherence">,
  maxSpend: number,
) {
  const spendN = (lp.spend / maxSpend) * 100;
  const lpE = lp.lpExp === "Au-dessus" ? 100 : lp.lpExp === "Moyenne" ? 55 : 15;
  // Higher score = more opportunity: high spend weighs most, weak QS/LP exp/CVR raise it
  return Math.round(
    clamp(
      spendN * 0.45 +
        (10 - lp.qs) * 10 * 0.2 +
        (100 - lpE) * 0.15 +
        (100 - clamp(lp.cvr * 15)) * 0.1 +
        (100 - lp.coherence) * 0.1,
    ),
  );
}

export function scoreCRO(
  lp: Pick<
    LP,
    "ctaCount" | "ctaAboveFold" | "lhPerf" | "scrollDepth" | "h2Count" | "reassurance" | "sections"
  >,
) {
  return Math.round(
    clamp(
      (lp.ctaAboveFold ? 20 : 0) +
        Math.min(lp.ctaCount, 4) * 4 +
        lp.lhPerf * 0.25 +
        lp.scrollDepth * 0.15 +
        Math.min(lp.h2Count, 6) * 2 +
        (lp.reassurance ? 10 : 0) +
        Math.min(lp.sections, 8),
    ),
  );
}

export function scoreShopify(
  templateShare: number,
  dynamicSections: number,
  metafields: number,
  legacy: boolean,
) {
  return Math.round(
    clamp(
      templateShare * 45 +
        Math.min(dynamicSections, 6) * 6 +
        Math.min(metafields, 10) * 2.5 -
        (legacy ? 25 : 0) +
        5,
    ),
  );
}

export function globalScore(sea: number, cro: number, shop: number) {
  // Priority = SEA opportunity × CRO weakness, boosted by scalability
  return Math.round(clamp(sea * 0.5 + (100 - cro) * 0.35 + shop * 0.15));
}

export function priorityOf(g: number): LP["priority"] {
  return g >= 60 ? "P1" : g >= 45 ? "P2" : "P3";
}

export type Approach = "Optimisation template" | "Optimisation individuelle" | "Approche hybride";

/** Share of LPs on the dominant shared templates decides the approach. */
export function recommendApproach(templateCounts: Record<string, number>, total: number): Approach {
  const shared = Object.entries(templateCounts)
    .filter(([t, c]) => c >= 10 && t !== "page.custom-legacy")
    .reduce((s, [, c]) => s + c, 0);
  const ratio = shared / total;
  if (ratio >= 0.7) return "Optimisation template";
  if (ratio <= 0.3) return "Optimisation individuelle";
  return "Approche hybride";
}

function build(): LP[] {
  const r = rng(42);
  const pick = <T>(a: T[]) => a[Math.floor(r() * a.length)];
  const weights = [0.3, 0.22, 0.15, 0.1, 0.13, 0.1];
  const raw = Array.from({ length: 184 }, (_, i) => {
    let x = r(),
      t = 0;
    while (x > weights[t] && t < weights.length - 1) x -= weights[t++];
    const template = TEMPLATES[t];
    const spend = Math.round(Math.pow(r(), 2.4) * 18000 + 80);
    const qs = Math.max(1, Math.min(10, Math.round(3 + r() * 7)));
    const lpRoll = r();
    const lpExp: LP["lpExp"] =
      lpRoll > 0.6 ? "Au-dessus" : lpRoll > 0.25 ? "Moyenne" : "En dessous";
    const lhPerf = Math.round(25 + r() * 70 - (template === "page.custom-legacy" ? 15 : 0));
    const slug = `${pick(SLUGS)}-${pick(SLUGS)}-${i + 1}`;
    const kws = Array.from(new Set([pick(KW), pick(KW), pick(KW)]));
    const shopSections = Array.from(
      new Set(Array.from({ length: 3 + Math.floor(r() * 5) }, () => pick(SECTIONS))),
    );
    return {
      id: i + 1,
      url: `/pages/${slug}`,
      dataCoverage: "demo" as const,
      campaign: pick(CAMPAIGNS),
      adGroup: `AG - ${kws[0]}`,
      spend,
      impressions: Math.round(spend * (20 + r() * 3)),
      clicks: Math.round(spend / (0.3 + r() * 2.2)),
      qs,
      lpExp,
      ctr: +(1 + r() * 9).toFixed(2),
      cvr: +(0.3 + r() * 5.5).toFixed(2),
      cpc: +(0.3 + r() * 2.2).toFixed(2),
      keywords: kws,
      coherence: Math.round(40 + r() * 60),
      h1: `${kws[0].replace(/^./, (c) => c.toUpperCase())} — collection 2026`,
      h2Count: Math.floor(r() * 8),
      ctaCount: Math.floor(r() * 6),
      ctaAboveFold: r() > 0.4,
      sections: shopSections.length + Math.floor(r() * 3),
      reassurance: r() > 0.45,
      scrollDepth: Math.round(20 + r() * 70),
      loadTime: +(1.2 + r() * 5.5).toFixed(1),
      assetWeight: +(0.8 + r() * 6).toFixed(1),
      lhPerf: clamp(lhPerf),
      lhA11y: Math.round(60 + r() * 40),
      lhBP: Math.round(55 + r() * 45),
      lhSEO: Math.round(65 + r() * 35),
      template,
      shopSections,
      metafields: template === "page.custom-legacy" ? Math.floor(r() * 2) : Math.floor(r() * 12),
      dynamicSections: template === "page.custom-legacy" ? 0 : Math.floor(r() * 6),
    };
  });
  const maxSpend = Math.max(...raw.map((l) => l.spend));
  const counts = countTemplates(raw);
  return raw.map((l) => {
    const sea = scoreSEA(l, maxSpend);
    const cro = scoreCRO(l);
    const shop = scoreShopify(
      counts[l.template] / raw.length / 0.3,
      l.dynamicSections,
      l.metafields,
      l.template === "page.custom-legacy",
    );
    const g = globalScore(sea, cro, shop);
    return {
      ...l,
      scoreSEA: sea,
      scoreCRO: cro,
      scoreShopify: shop,
      scoreGlobal: g,
      priority: priorityOf(g),
    };
  });
}

export function countTemplates(lps: { template: string }[]) {
  return lps.reduce<Record<string, number>>(
    (acc, l) => ((acc[l.template] = (acc[l.template] ?? 0) + 1), acc),
    {},
  );
}

let cache: LP[] | null = null;
let currentAnalysis: LP[] | null = null;

export function getLPs(): LP[] {
  if (!cache) cache = build();
  return cache;
}

export function getCurrentLPs(): LP[] {
  return currentAnalysis ?? getLPs();
}

export function setCurrentLPs(lps: LP[] | null) {
  currentAnalysis = lps;
}

export function estimate(lps: LP[]) {
  const counts = countTemplates(lps);
  const approach = recommendApproach(counts, lps.length);
  const p1 = lps.filter((l) => l.priority === "P1");
  const sharedTemplates = Object.entries(counts)
    .filter(([t, c]) => c >= 10 && t !== "page.custom-legacy")
    .map(([t]) => t);
  const legacy = lps.filter((l) => l.template === "page.custom-legacy");
  const templateDays = sharedTemplates.length * 6;
  const individualDays = Math.ceil(
    (approach === "Optimisation template"
      ? legacy.filter((l) => l.priority === "P1").length
      : p1.length) * 0.75,
  );
  const days = templateDays + individualDays + 5; // + audit/QA/AB setup
  const tjm = 650;
  return { approach, counts, sharedTemplates, legacy, p1, days, tjm, budget: days * tjm };
}

export const eur = (n: number) =>
  n.toLocaleString("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });

export function toCSV(rows: Record<string, unknown>[]) {
  if (!rows.length) return "";
  const keys = Object.keys(rows[0]);
  const esc = (v: unknown) =>
    `"${String(Array.isArray(v) ? v.join(" | ") : v).replace(/"/g, '""')}"`;
  return [keys.join(";"), ...rows.map((r) => keys.map((k) => esc(r[k])).join(";"))].join("\n");
}

export function downloadCSV(name: string, rows: Record<string, unknown>[]) {
  const blob = new Blob(["\ufeff" + toCSV(rows)], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
}
