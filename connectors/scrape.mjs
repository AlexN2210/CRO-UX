import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { scrapeShopifyLandingPages } from "./shopify.mjs";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const targetsPath = path.resolve(
  process.argv[2] ?? path.join(scriptDirectory, "targets/carea-cuisine-bain.json"),
);
const reportPath = path.resolve(
  process.argv[3] ?? path.join(scriptDirectory, "reports/carea-cuisine-bain.json"),
);
const urls = JSON.parse(await readFile(targetsPath, "utf8"));
if (!Array.isArray(urls) || urls.some((url) => typeof url !== "string")) {
  throw new Error("Target file must be a JSON array of URLs.");
}

const siteUrl = process.env.SHOPIFY_SITE_URL ?? new URL(urls[0]).origin;
const env = { ...process.env, SHOPIFY_SITE_URL: siteUrl };
const startedAt = new Date().toISOString();
const lps = await scrapeShopifyLandingPages({ urls, env });
const completedUrls = new Set(lps.map((lp) => lp.url));
const normalizedTargets = urls.map((url) => new URL(url).href);
const canonicalGroups = new Map();
for (const lp of lps) {
  const canonicalUrl = lp.shopifyMetadata?.finalUrl ?? lp.url;
  const aliases = canonicalGroups.get(canonicalUrl) ?? [];
  aliases.push(lp.url);
  canonicalGroups.set(canonicalUrl, aliases);
}
const report = {
  siteUrl,
  startedAt,
  completedAt: new Date().toISOString(),
  requestedCount: urls.length,
  scrapedCount: lps.length,
  uniqueFinalUrlCount: canonicalGroups.size,
  redirectedUrlCount: lps.filter((lp) => lp.shopifyMetadata?.finalUrl !== lp.url).length,
  duplicateFinalUrls: [...canonicalGroups]
    .filter(([, aliases]) => aliases.length > 1)
    .map(([finalUrl, aliases]) => ({ finalUrl, aliases })),
  failedUrls: normalizedTargets.filter((url) => !completedUrls.has(url)),
  lighthouseAuditedCount: lps.filter((lp) => lp.lhPerf > 0).length,
  lps,
};

await mkdir(path.dirname(reportPath), { recursive: true });
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(
  JSON.stringify(
    {
      reportPath,
      requestedCount: report.requestedCount,
      scrapedCount: report.scrapedCount,
      failedCount: report.failedUrls.length,
      lighthouseAuditedCount: report.lighthouseAuditedCount,
      uniqueFinalUrlCount: report.uniqueFinalUrlCount,
      redirectedUrlCount: report.redirectedUrlCount,
    },
    null,
    2,
  ),
);
