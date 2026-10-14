import Papa from "papaparse";
import { getLPs, priorityOf, type LP } from "./data";

export type GoogleAdsCsvRow = Record<string, string>;

export type GoogleAdsCsvBundle = {
  campaigns: GoogleAdsCsvRow[];
  keywords: GoogleAdsCsvRow[];
  searchTerms: GoogleAdsCsvRow[];
  landingPages: GoogleAdsCsvRow[];
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
  const parsed = Papa.parse<Record<string, string>>(csvText.replace(/^\uFEFF/u, ""), {
    header: true,
    skipEmptyLines: "greedy",
    dynamicTyping: false,
    transformHeader: (header) => header.trim(),
  });

  if (parsed.errors.length > 0) {
    const fatal = parsed.errors.find((error) => error.type !== "FieldMismatch");
    if (fatal) throw new Error(`CSV illisible : ${fatal.message}`);
  }

  return parsed.data.filter((row) =>
    Object.values(row).some((value) => String(value ?? "").trim()),
  );
}

function getRowUrl(row: GoogleAdsCsvRow): string | undefined {
  const rawUrl = firstValue(row, [
    "Landing page",
    "Landing page URL",
    "Final URL",
    "Expanded final URL",
    "Page",
    "URL",
    "Page URL",
    "URL finale",
    "Page de destination",
    "URL de la page de destination",
  ]);
  if (!rawUrl) return undefined;

  try {
    const url = new URL(rawUrl);
    return ["http:", "https:"].includes(url.protocol) ? url.toString() : undefined;
  } catch {
    return undefined;
  }
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
  const micros = firstValue(row, ["Cost micros", "Cost (micros)", "Coût micros"]);
  if (micros) return parseNumber(micros) / 1_000_000;
  return parseNumber(firstValue(row, ["Cost", "Spend", "Cost (converted)", "Coût", "Dépenses"]));
}

function getClicks(row: GoogleAdsCsvRow): number {
  return parseNumber(firstValue(row, ["Clicks", "Clics"]));
}

function getImpressions(row: GoogleAdsCsvRow): number {
  return parseNumber(firstValue(row, ["Impressions", "Impr.", "Impressions"]));
}

function getConversions(row: GoogleAdsCsvRow): number {
  return parseNumber(firstValue(row, ["Conversions", "Conv.", "Conversions (by conv. time)"]));
}

function getQualityScore(row: GoogleAdsCsvRow): number | undefined {
  const value = parseNumber(
    firstValue(row, ["Quality Score", "Quality score", "Niveau de qualité", "QS"]),
  );
  return value > 0 ? value : undefined;
}

function getLandingExperience(row: GoogleAdsCsvRow): LP["lpExp"] | undefined {
  const value = normalizeHeader(
    firstValue(row, [
      "Landing page experience",
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
}): GoogleAdsCsvBundle {
  const campaigns = files.campaigns ? parseGoogleAdsCsv(files.campaigns) : [];
  const keywords = files.keywords ? parseGoogleAdsCsv(files.keywords) : [];
  const searchTerms = files.searchTerms ? parseGoogleAdsCsv(files.searchTerms) : [];
  const landingPages = files.landingPages ? parseGoogleAdsCsv(files.landingPages) : [];
  const warnings: string[] = [];

  if (
    campaigns.length === 0 &&
    keywords.length === 0 &&
    searchTerms.length === 0 &&
    landingPages.length === 0
  ) {
    throw new Error("Ajoute au moins un CSV Google Ads avant de lancer l’import.");
  }

  const lpMetrics = aggregateRows(landingPages);
  const keywordMetrics = aggregateRows(keywords);
  const campaignMetrics = aggregateRows(campaigns);
  const searchMetrics = aggregateRows(searchTerms);
  const allUrls = new Set([
    ...lpMetrics.keys(),
    ...keywordMetrics.keys(),
    ...campaignMetrics.keys(),
    ...searchMetrics.keys(),
  ]);

  if (allUrls.size === 0) {
    throw new Error(
      "Aucune URL de landing page reconnue. Exporte une colonne Landing page URL ou Final URL.",
    );
  }

  if (landingPages.length === 0)
    warnings.push(
      "CSV Landing pages absent : les métriques par page seront agrégées à partir des autres fichiers qui contiennent une URL.",
    );
  if (keywords.length === 0)
    warnings.push("CSV Mots-clés absent : Quality Score et expérience LP indisponibles.");
  if (searchTerms.length === 0)
    warnings.push("CSV Requêtes absent : les requêtes de recherche ne seront pas affichées.");

  const lps: LP[] = [...allUrls].map((url, index) => {
    const metrics =
      lpMetrics.get(url) ??
      keywordMetrics.get(url) ??
      campaignMetrics.get(url) ??
      searchMetrics.get(url)!;
    const keywordRows = keywords.filter((row) => getRowUrl(row) === url);
    const qualities = keywordRows
      .map(getQualityScore)
      .filter((value): value is number => value !== undefined);
    const experiences = keywordRows
      .map(getLandingExperience)
      .filter((value): value is LP["lpExp"] => value !== undefined);
    const qs = qualities.length
      ? qualities.reduce((sum, value) => sum + value, 0) / qualities.length
      : 0;
    const clicks = metrics.clicks;
    const spend = metrics.spend;
    const impressions = metrics.impressions;
    const conversions = metrics.conversions;
    const ctr = impressions ? (clicks / impressions) * 100 : 0;
    const cvr = clicks ? (conversions / clicks) * 100 : 0;
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
      conversions,
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
      keywords: keywordRows
        .map(
          (row) =>
            firstValue(row, ["Keyword", "Keyword text", "Mot clé", "Mot clé de recherche"]) ?? "",
        )
        .filter(Boolean),
      template: "Non analysé",
    };
  });

  return { campaigns, keywords, searchTerms, landingPages, lps, warnings };
}
