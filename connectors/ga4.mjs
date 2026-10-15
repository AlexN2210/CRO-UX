import { BetaAnalyticsDataClient } from "@google-analytics/data";
import { canonicalPath, lpRecord, normalizeTargetUrls } from "./shared.mjs";

const FUNNEL_EVENTS = ["view_item", "add_to_cart", "begin_checkout", "purchase"];

function numberValue(value) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function dimension(row, index) {
  return row.dimensionValues?.[index]?.value ?? "";
}

function metric(row, index) {
  return numberValue(row.metricValues?.[index]?.value);
}

function createClient(env) {
  const serviceAccountJson = env.GOOGLE_APPLICATION_CREDENTIALS_JSON;
  if (serviceAccountJson) {
    return new BetaAnalyticsDataClient({ credentials: JSON.parse(serviceAccountJson) });
  }
  if (env.GOOGLE_APPLICATION_CREDENTIALS) {
    return new BetaAnalyticsDataClient({ keyFilename: env.GOOGLE_APPLICATION_CREDENTIALS });
  }
  return new BetaAnalyticsDataClient();
}

export async function fetchGa4LandingPages({
  urls,
  env = process.env,
  client = createClient(env),
}) {
  const propertyId = env.GA4_PROPERTY_ID;
  const siteUrl = env.SHOPIFY_SITE_URL;
  if (!propertyId || !/^\d+$/u.test(propertyId))
    throw new Error("GA4_PROPERTY_ID must be the numeric property ID.");
  if (!siteUrl) throw new Error("SHOPIFY_SITE_URL is required to map GA4 paths to LP URLs.");

  const site = new URL(siteUrl);
  const targets = normalizeTargetUrls(urls, site, Number(env.GA4_MAX_PAGES ?? 10_000));
  const targetByPath = new Map(targets.map((url) => [canonicalPath(url, site), url]));
  const startDate = env.GA4_START_DATE ?? "90daysAgo";
  const endDate = env.GA4_END_DATE ?? "yesterday";
  const property = `properties/${propertyId}`;

  const [pageReport] = await client.runReport({
    property,
    dateRanges: [{ startDate, endDate }],
    dimensions: [{ name: "pagePath" }],
    metrics: [
      { name: "sessions" },
      { name: "screenPageViews" },
      { name: "conversions" },
      { name: "purchaseRevenue" },
      { name: "engagementRate" },
    ],
    limit: 100_000,
  });

  const pages = new Map();
  for (const row of pageReport.rows ?? []) {
    const path = canonicalPath(dimension(row, 0), site);
    const url =
      targetByPath.get(path) ?? (targets.length === 0 ? new URL(path, site).href : undefined);
    if (!url) continue;
    pages.set(url, {
      url,
      sessions: metric(row, 0),
      pageviews: metric(row, 1),
      conversions: metric(row, 2),
      revenue: metric(row, 3),
      engagementRate: metric(row, 4) * 100,
      viewItemCount: 0,
      addToCartCount: 0,
      beginCheckoutCount: 0,
      purchaseCount: 0,
      sourceMediums: [],
      campaignIds: [],
    });
  }

  if (pages.size === 0) return [];

  const [eventReport] = await client.runReport({
    property,
    dateRanges: [{ startDate, endDate }],
    dimensions: [{ name: "pagePath" }, { name: "eventName" }],
    metrics: [{ name: "eventCount" }],
    dimensionFilter: {
      filter: {
        fieldName: "eventName",
        inListFilter: { values: FUNNEL_EVENTS, caseSensitive: true },
      },
    },
    limit: 100_000,
  });

  const eventFields = {
    view_item: "viewItemCount",
    add_to_cart: "addToCartCount",
    begin_checkout: "beginCheckoutCount",
    purchase: "purchaseCount",
  };
  for (const row of eventReport.rows ?? []) {
    const path = canonicalPath(dimension(row, 0), site);
    const url =
      targetByPath.get(path) ?? (targets.length === 0 ? new URL(path, site).href : undefined);
    const page = pages.get(url);
    const field = eventFields[dimension(row, 1)];
    if (page && field) page[field] = metric(row, 0);
  }

  const [attributionReport] = await client.runReport({
    property,
    dateRanges: [{ startDate, endDate }],
    dimensions: [
      { name: "pagePath" },
      { name: "sessionSourceMedium" },
      { name: "sessionCampaignId" },
    ],
    metrics: [{ name: "sessions" }],
    limit: 100_000,
  });
  for (const row of attributionReport.rows ?? []) {
    const path = canonicalPath(dimension(row, 0), site);
    const url =
      targetByPath.get(path) ?? (targets.length === 0 ? new URL(path, site).href : undefined);
    const page = pages.get(url);
    if (!page) continue;
    const sourceMedium = dimension(row, 1);
    const campaignId = dimension(row, 2);
    if (sourceMedium && sourceMedium !== "(not set)") page.sourceMediums.push(sourceMedium);
    if (campaignId && campaignId !== "(not set)") page.campaignIds.push(campaignId);
  }

  return [...pages.values()].map((page) =>
    lpRecord(page.url, {
      ...page,
      cvRate: page.sessions > 0 ? (page.conversions / page.sessions) * 100 : 0,
      sourceMediums: [...new Set(page.sourceMediums)],
      campaignIds: [...new Set(page.campaignIds)],
    }),
  );
}
