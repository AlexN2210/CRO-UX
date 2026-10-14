import Papa from "papaparse";
import { getLPs, priorityOf, type LP } from "./data";

export type GoogleAdsCsvRow = Record<string, string>;

export type GoogleAdsCsvBundle = {
  campaigns: GoogleAdsCsvRow[];
  keywords: GoogleAdsCsvRow[];
  searchTerms: GoogleAdsCsvRow[];
  landingPages: GoogleAdsCsvRow[];
  conversions: GoogleAdsCsvRow[];
  lpQuality: GoogleAdsCsvRow[];
  meta: GoogleAdsCsvRow[];
  lps: LP[];
  warnings: string[];
};

function normalizeHeader(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, " ")
    .trim();
}

function parseNumber(value: string | undefined): number {
  if (!value) return 0;
  let normalized = value.trim().replace(/[€$£\s]/gu, "");
  if (!normalized || normalized === "--") return 0;

  if (normalized.includes(",") && normalized.includes(".")) {
    normalized =
      normalized.lastIndexOf(",") > normalized.lastIndexOf(".")
        ? normalized.replace(/\./gu, "").replace(",", ".")
        : normalized.replace(/,/gu, "");
  } else if (normalized.includes(",")) {
    normalized = normalized.replace(",", ".");
  }

  const parsed = Number(normalized.replace(/%$/u, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function firstValue(row: GoogleAdsCsvRow, candidates: string[]): string | undefined {
  const normalized = new Map(
    Object.entries(row).map(([key, value]) => [normalizeHeader(key), value]),
  );
  for (const candidate of candidates) {
    const value = normalized.get(normalizeHeader(candidate));
    if (value?.trim()) return value.trim();
  }
  return undefined;
}

export function parseGoogleAdsCsv(csvText: string): GoogleAdsCsvRow[] {
  const parsed = Papa.parse<string[]>(csvText.replace(/^\uFEFF/u, ""), {
    header: false,
    skipEmptyLines: "greedy",
    dynamicTyping: false,
  });

  if (parsed.errors.length > 0) {
    const fatal = parsed.errors.find((error) => error.type !== "FieldMismatch");
    if (fatal) throw new Error(`CSV illisible : ${fatal.message}`);
  }

  const scoreHeaderRow = (row: string[]) => {
    const headers = row.map(normalizeHeader);
    const categories = [
      /(?:landing ?page|landingpage|final ?url|url finale|page de destination)/u,
      /(?:^| )(?:campaign|campagne)(?: |$)/u,
      /(?:^| )(?:cost|spend|cout|depenses|budget)(?: |$)/u,
      /(?:^| )(?:clicks?|clics?)(?: |$)/u,
      /(?:^| )(?:impressions?|impr)(?: |$)/u,
      /(?:conversion|conversions)/u,
      /(?:keyword|mot cle|search term|requete)/u,
      /(?:quality score|lp quality|experience)/u,
    ];
    return categories.reduce(
      (score, category) => score + Number(headers.some((header) => category.test(header))),
      0,
    );
  };

  const headerCandidates = parsed.data.slice(0, 30).map((row, index) => ({
    row,
    index,
    score: scoreHeaderRow(row),
  }));
  const headerRow = headerCandidates.reduce((best, candidate) =>
    candidate.score > best.score ? candidate : best,
  );
  const seenHeaders = new Map<string, number>();
  const headers = headerRow.row.map((value, index) => {
    const base = value.trim() || `_${index}`;
    const occurrence = seenHeaders.get(base) ?? 0;
    seenHeaders.set(base, occurrence + 1);
    return occurrence === 0 ? base : `${base}_${occurrence}`;
  });

  return parsed.data
    .slice(headerRow.index + 1)
    .filter((row) => row.some((value) => String(value ?? "").trim()))
    .map((row) =>
      Object.fromEntries(headers.map((header, index) => [header, String(row[index] ?? "").trim()])),
    );
}

function getRowUrl(row: GoogleAdsCsvRow): string | undefined {
  const knownUrl = firstValue(row, [
    "Landing page",
    "Landing page URL",
    "LandingPage",
    "Landing page (expanded)",
    "Final URL",
    "FinalURL",
    "Final mobile URL",
    "Expanded final URL",
    "Expanded landing page",
    "Page",
    "URL",
    "Page URL",
    "URL finale",
    "URL finale développée",
    "URL finale étendue",
    "URL finale élargie",
    "URL de destination finale",
    "URL de destination",
    "Page de destination",
    "Page de destination (URL)",
    "URL de la page de destination",
  ]);
  const candidates = [
    knownUrl,
    ...Object.entries(row)
      .filter(([header]) => {
        const normalized = normalizeHeader(header);
        return (
          normalized.includes("url") ||
          normalized.includes("landing page") ||
          normalized.includes("page de destination") ||
          normalized.includes("url de destination")
        );
      })
      .map(([, value]) => value),
  ];

  for (const candidate of candidates) {
    const value = candidate?.trim();
    if (!value || /^(?:--|n\/a|not set)$/iu.test(value)) continue;
    const withProtocol = value.startsWith("//")
      ? `https:${value}`
      : /^[a-z][a-z\d+.-]*:\/\//iu.test(value)
        ? value
        : /^(?:www\.)?[^\s/]+\.[a-z]{2,}(?:[/:?#]|$)/iu.test(value)
          ? `https://${value}`
          : value;

    try {
      const url = new URL(withProtocol);
      if (["http:", "https:"].includes(url.protocol)) return url.toString();
    } catch {
      continue;
    }
  }

  return undefined;
}

function getCampaign(row: GoogleAdsCsvRow): string {
  return firstValue(row, ["Campaign", "Campaign name", "Campagne", "Nom de la campagne"]) ?? "";
}

function getAdGroup(row: GoogleAdsCsvRow): string {
  return (
    firstValue(row, [
      "Ad group",
      "Ad group name",
      "Groupe d'annonces",
      "Nom du groupe d'annonces",
    ]) ?? ""
  );
}

function getSpend(row: GoogleAdsCsvRow): number {
  const micros = firstValue(row, [
    "Cost micros",
    "Cost (micros)",
    "Total cost micros",
    "metrics.cost_micros",
    "Coût micros",
  ]);
  if (micros) return parseNumber(micros) / 1_000_000;
  return parseNumber(
    firstValue(row, [
      "Cost",
      "Total cost",
      "Spend",
      "Amount spent",
      "Cost (converted)",
      "Coût",
      "Coût total",
      "Dépenses",
    ]),
  );
}

function getClicks(row: GoogleAdsCsvRow): number {
  return parseNumber(
    firstValue(row, ["Clicks", "Total clicks", "metrics.clicks", "Clics", "Total clics"]),
  );
}

function getImpressions(row: GoogleAdsCsvRow): number {
  return parseNumber(
    firstValue(row, ["Impressions", "Total impressions", "metrics.impressions", "Impr."]),
  );
}

function getConversions(row: GoogleAdsCsvRow): number {
  return parseNumber(
    firstValue(row, [
      "Conversions",
      "Conversion",
      "Conv.",
      "All conversions",
      "Toutes les conversions",
      "metrics.conversions",
      "Conversions (by conv. time)",
    ]),
  );
}

function getQualityScore(row: GoogleAdsCsvRow): number | undefined {
  const value = parseNumber(
    firstValue(row, [
      "Quality Score",
      "QualityScore",
      "Quality score",
      "LP Quality",
      "LP Quality Score",
      "Score qualité LP",
      "Niveau de qualité",
      "QS",
    ]),
  );
  return value > 0 ? value : undefined;
}

function getLandingExperience(row: GoogleAdsCsvRow): LP["lpExp"] | undefined {
  const value = normalizeHeader(
    firstValue(row, [
      "Landing page experience",
      "LP experience",
      "Exp. landing page",
      "Expérience sur la page de destination",
    ]) ?? "",
  );
  if (value.includes("above") || value.includes("superieur")) return "Au-dessus";
  if (value.includes("below") || value.includes("inferieur")) return "En dessous";
  if (value.includes("average") || value.includes("moyen")) return "Moyenne";
  return undefined;
}

function aggregateRows(rows: GoogleAdsCsvRow[]) {
  const byUrl = new Map<
    string,
    {
      spend: number;
      clicks: number;
      impressions: number;
      conversions: number;
      campaigns: Set<string>;
      adGroups: Set<string>;
    }
  >();

  for (const row of rows) {
    const url = getRowUrl(row);
    if (!url) continue;
    const current = byUrl.get(url) ?? {
      spend: 0,
      clicks: 0,
      impressions: 0,
      conversions: 0,
      campaigns: new Set<string>(),
      adGroups: new Set<string>(),
    };
    current.spend += getSpend(row);
    current.clicks += getClicks(row);
    current.impressions += getImpressions(row);
    current.conversions += getConversions(row);
    if (getCampaign(row)) current.campaigns.add(getCampaign(row));
    if (getAdGroup(row)) current.adGroups.add(getAdGroup(row));
    byUrl.set(url, current);
  }

  return byUrl;
}

export function createGoogleAdsCsvBundle(files: {
  campaigns?: string;
  keywords?: string;
  searchTerms?: string;
  landingPages?: string;
  conversions?: string;
  lpQuality?: string;
  meta?: string;
}): GoogleAdsCsvBundle {
  const campaigns = files.campaigns ? parseGoogleAdsCsv(files.campaigns) : [];
  const keywords = files.keywords ? parseGoogleAdsCsv(files.keywords) : [];
  const searchTerms = files.searchTerms ? parseGoogleAdsCsv(files.searchTerms) : [];
  const landingPages = files.landingPages ? parseGoogleAdsCsv(files.landingPages) : [];
  const conversions = files.conversions ? parseGoogleAdsCsv(files.conversions) : [];
  const lpQuality = files.lpQuality ? parseGoogleAdsCsv(files.lpQuality) : [];
  const meta = files.meta ? parseGoogleAdsCsv(files.meta) : [];
  const warnings: string[] = [];

  const allRows = [campaigns, keywords, searchTerms, landingPages, conversions, lpQuality, meta];
  if (allRows.every((rows) => rows.length === 0)) {
    throw new Error("Ajoute au moins un CSV Google Ads avant de lancer l’import.");
  }

  const lpMetrics = aggregateRows(landingPages);
  const keywordMetrics = aggregateRows(keywords);
  const campaignMetrics = aggregateRows(campaigns);
  const searchMetrics = aggregateRows(searchTerms);
  const conversionMetrics = aggregateRows(conversions);
  const qualityMetrics = aggregateRows(lpQuality);
  const metaMetrics = aggregateRows(meta);
  const allUrls = new Set([
    ...lpMetrics.keys(),
    ...keywordMetrics.keys(),
    ...campaignMetrics.keys(),
    ...searchMetrics.keys(),
    ...conversionMetrics.keys(),
    ...qualityMetrics.keys(),
    ...metaMetrics.keys(),
  ]);

  if (allUrls.size === 0) {
    const detectedHeaders = [
      ...new Set(allRows.flatMap((rows) => (rows[0] ? Object.keys(rows[0]) : [])).filter(Boolean)),
    ];
    throw new Error(
      `Aucune URL de landing page reconnue. Les colonnes détectées sont : ${detectedHeaders.join(", ") || "aucune"}. Importe le rapport Google Ads "Pages de destination" (au moins un fichier doit contenir les URL finales).`,
    );
  }

  if (landingPages.length === 0)
    warnings.push(
      "CSV Landing pages absent : les métriques par page seront agrégées à partir des autres fichiers qui contiennent une URL.",
    );
  if (keywords.length === 0)
    if (lpQuality.length === 0)
      warnings.push(
        "CSV Keywords et LP_Quality absents : Quality Score et expérience LP indisponibles.",
      );
  if (searchTerms.length === 0)
    warnings.push("CSV Requêtes absent : les requêtes de recherche ne seront pas affichées.");
  if (conversions.length === 0)
    warnings.push(
      "CSV Conversions absent : les conversions du rapport Landing Pages sont utilisées.",
    );

  const lps: LP[] = [...allUrls].map((url, index) => {
    const metricSources = [
      lpMetrics.get(url),
      keywordMetrics.get(url),
      campaignMetrics.get(url),
      searchMetrics.get(url),
    ].filter((source) => source !== undefined);
    const firstAvailable = (metric: "spend" | "clicks" | "impressions" | "conversions") =>
      metricSources.find((source) => source[metric] > 0)?.[metric] ?? 0;
    const metrics = {
      spend: firstAvailable("spend"),
      clicks: firstAvailable("clicks"),
      impressions: firstAvailable("impressions"),
      conversions: firstAvailable("conversions"),
      campaigns: new Set(metricSources.flatMap((source) => [...source.campaigns])),
      adGroups: new Set(metricSources.flatMap((source) => [...source.adGroups])),
    };
    const qualityRows = [...lpQuality, ...keywords].filter((row) => getRowUrl(row) === url);
    const qualities = qualityRows
      .map(getQualityScore)
      .filter((value): value is number => value !== undefined);
    const experiences = qualityRows
      .map(getLandingExperience)
      .filter((value): value is LP["lpExp"] => value !== undefined);
    const qs = qualities.length
      ? qualities.reduce((sum, value) => sum + value, 0) / qualities.length
      : 0;
    const clicks = metrics.clicks;
    const spend = metrics.spend;
    const impressions = metrics.impressions;
    const conversionCount = conversionMetrics.has(url)
      ? conversionMetrics.get(url)!.conversions
      : metrics.conversions;
    const ctr = impressions ? (clicks / impressions) * 100 : 0;
    const cvr = clicks ? (conversionCount / clicks) * 100 : 0;
    const cpc = clicks ? spend / clicks : 0;
    const seaScore = Math.round(
      Math.min(
        100,
        (spend / Math.max(1, ...[...allUrls].map((item) => lpMetrics.get(item)?.spend ?? 0))) * 70 +
          Math.max(0, 100 - ctr * 10) * 0.15 +
          Math.max(0, 100 - cvr * 10) * 0.15,
      ),
    );
    const campaignNames = new Set([...metrics.campaigns]);
    return {
      ...getLPs()[0],
      id: index + 1,
      url,
      dataCoverage: "sea-only",
      campaign: [...campaignNames].join(" · ") || "Import CSV Google Ads",
      adGroup: [...metrics.adGroups].join(" · ") || "Non disponible",
      spend,
      clicks,
      impressions,
      conversions: conversionCount,
      ctr,
      cvr,
      cpc,
      qs,
      lpExp: experiences[0] ?? "Moyenne",
      scoreSEA: seaScore,
      scoreGlobal: seaScore,
      scoreCRO: 0,
      scoreShopify: 0,
      priority: priorityOf(seaScore),
      keywords: keywords
        .filter((row) => getRowUrl(row) === url)
        .map(
          (row) =>
            firstValue(row, ["Keyword", "Keyword text", "Mot clé", "Mot clé de recherche"]) ?? "",
        )
        .filter(Boolean),
      template: "Non analysé",
    };
  });

  const performanceHeaders = [
    ...new Set(
      [landingPages, campaigns, keywords, searchTerms]
        .flatMap((rows) => (rows[0] ? Object.keys(rows[0]) : []))
        .filter(Boolean),
    ),
  ];
  const missingMetrics = [
    [lps.some((lp) => lp.spend > 0), "dépense"],
    [lps.some((lp) => lp.clicks > 0), "clics"],
    [lps.some((lp) => lp.impressions > 0), "impressions"],
  ]
    .filter(([found]) => !found)
    .map(([, label]) => label);
  if (missingMetrics.length > 0) {
    warnings.push(
      `Aucune valeur reconnue pour ${missingMetrics.join(", ")}. En-têtes des exports : ${performanceHeaders.join(", ") || "aucun"}.`,
    );
  }

  return {
    campaigns,
    keywords,
    searchTerms,
    landingPages,
    conversions,
    lpQuality,
    meta,
    lps,
    warnings,
  };
}
