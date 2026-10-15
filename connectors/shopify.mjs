import { chromium } from "playwright";
import lighthouse from "lighthouse";
import {
  canonicalPath,
  getAllowedStorefrontHosts,
  lpRecord,
  normalizeTargetUrls,
} from "./shared.mjs";
import { matchThemeTemplate, readThemeTemplates } from "./theme.mjs";

const CTA_PATTERN =
  /buy now|add to cart|add to bag|shop now|order now|acheter|ajouter au panier|commander|configurer|demander un devis|obtenir un devis|réserver|en profiter|cliquez ici|découvrir nos remises/iu;
const PRODUCT_LINK_PATTERN = /open the product page|open product page|ouvrir la page du produit/iu;
const TRUST_PATTERN =
  /free shipping|free delivery|returns|refund|warranty|secure checkout|livraison offerte|retour gratuit|remboursement|garantie|paiement sécurisé/iu;
const APP_PATTERN =
  /klaviyo|hotjar|gorgias|recharge|yotpo|judge\.me|reviews\.io|attentive|northbeam|triplewhale/iu;

async function discoverStorefrontUrls(site, maximum, allowedHosts) {
  const sitemapUrl = new URL("/sitemap.xml", site);
  const sitemapResponse = await fetch(sitemapUrl, { signal: AbortSignal.timeout(15_000) });
  if (!sitemapResponse.ok)
    throw new Error(`Shopify sitemap request failed (${sitemapResponse.status}).`);
  const sitemap = await sitemapResponse.text();
  const locations = [...sitemap.matchAll(/<loc>\s*([^<]+)\s*<\/loc>/giu)].map((match) =>
    match[1].trim(),
  );
  const sitemaps = locations.filter((value) => /sitemap[^/]*\.xml(?:\?|$)/iu.test(value));
  const pageLocations = locations.filter((value) =>
    /\/(?:pages|products|collections)\//iu.test(value),
  );
  const discovered = [...pageLocations];

  for (const childSitemap of sitemaps.slice(0, 20)) {
    if (discovered.length >= maximum) break;
    const childUrl = new URL(childSitemap);
    if (childUrl.origin !== site.origin) continue;
    const childResponse = await fetch(childUrl, { signal: AbortSignal.timeout(15_000) });
    if (!childResponse.ok) continue;
    const childXml = await childResponse.text();
    for (const match of childXml.matchAll(/<loc>\s*([^<]+)\s*<\/loc>/giu)) {
      const value = match[1].trim();
      if (/\/(?:pages|products|collections)\//iu.test(value)) discovered.push(value);
      if (discovered.length >= maximum) break;
    }
  }

  const configuredHostUrls = discovered.flatMap((value) => {
    try {
      const parsed = new URL(value, site);
      return allowedHosts.has(parsed.hostname.toLowerCase())
        ? [new URL(`${parsed.pathname}${parsed.search}${parsed.hash}`, site).href]
        : [];
    } catch {
      return [];
    }
  });
  return normalizeTargetUrls(configuredHostUrls, site, maximum, allowedHosts);
}

function lighthouseScores(report) {
  const categories = report?.lhr?.categories ?? {};
  const audits = report?.lhr?.audits ?? {};
  const score = (name) => Math.round((categories[name]?.score ?? 0) * 100);
  const numericAudit = (name) => {
    const value = audits[name]?.numericValue;
    return typeof value === "number" ? value : undefined;
  };
  const lcpMilliseconds = numericAudit("largest-contentful-paint");
  return {
    lhPerf: score("performance"),
    lhA11y: score("accessibility"),
    lhBP: score("best-practices"),
    lhSEO: score("seo"),
    ...(lcpMilliseconds === undefined ? {} : { lcp: lcpMilliseconds / 1000 }),
    ...(numericAudit("cumulative-layout-shift") === undefined
      ? {}
      : { cls: numericAudit("cumulative-layout-shift") }),
    ...(numericAudit("interaction-to-next-paint") === undefined
      ? {}
      : { inp: numericAudit("interaction-to-next-paint") }),
  };
}

export async function scrapeShopifyLandingPages({ urls, env = process.env }) {
  const siteUrl = env.SHOPIFY_SITE_URL;
  if (!siteUrl) throw new Error("SHOPIFY_SITE_URL is required.");
  const site = new URL(siteUrl);
  if (site.protocol !== "https:") throw new Error("SHOPIFY_SITE_URL must use HTTPS.");
  const allowedHosts = getAllowedStorefrontHosts(site, env.SHOPIFY_ALLOWED_HOSTS ?? "");

  const maxPages = Math.max(1, Number(env.SHOPIFY_MAX_PAGES ?? 40));
  const lighthouseMaxPages = Math.max(0, Number(env.SHOPIFY_LIGHTHOUSE_MAX_PAGES ?? 5));
  const requestedTargets = normalizeTargetUrls(urls, site, 10_000, allowedHosts);
  const targets =
    urls.length > 0
      ? requestedTargets.slice(0, maxPages)
      : await discoverStorefrontUrls(site, maxPages, allowedHosts);
  if (targets.length === 0)
    throw new Error("No same-storefront URLs were provided to Shopify adapter.");

  const themeTemplates = await readThemeTemplates(env.SHOPIFY_THEME_DIR);
  const browser = await chromium.launch({
    headless: true,
    ...(env.CHROME_EXECUTABLE_PATH ? { executablePath: env.CHROME_EXECUTABLE_PATH } : {}),
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--remote-debugging-port=9222"],
  });
  const results = [];
  const failures = [];

  try {
    const context = await browser.newContext({
      viewport: { width: 1365, height: 900 },
      userAgent: "LP-Radar-Audit/1.0 (+https://lpradar.example)",
    });

    for (const [index, url] of targets.entries()) {
      const page = await context.newPage();
      try {
        const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
        await page.waitForLoadState("networkidle", { timeout: 8_000 }).catch(() => undefined);
        const finalUrl = new URL(page.url());
        if (!allowedHosts.has(finalUrl.hostname.toLowerCase())) {
          failures.push({ url, error: `Redirected to non-allowed host ${finalUrl.hostname}.` });
          continue;
        }
        if (response && response.status() >= 400) {
          failures.push({ url, error: `HTTP ${response.status()}.` });
          continue;
        }

        const signals = await page.evaluate(
          ({ ctaSource, trustSource, appSource, productLinkSource }) => {
            const ctaPattern = new RegExp(ctaSource, "iu");
            const trustPattern = new RegExp(trustSource, "iu");
            const appPattern = new RegExp(appSource, "iu");
            const productLinkPattern = new RegExp(productLinkSource, "iu");
            const text = (element) => (element?.innerText ?? "").trim();
            const ctas = [...document.querySelectorAll("a, button, input[type=submit]")]
              .map((element) => ({
                label: text(element) || element.getAttribute("aria-label") || element.value || "",
                rect: element.getBoundingClientRect(),
              }))
              .filter((item) => item.label && ctaPattern.test(item.label));
            const productLinkCount = [...document.querySelectorAll("main a")].filter((element) =>
              productLinkPattern.test(text(element) || element.getAttribute("aria-label") || ""),
            ).length;
            const resourceEntries = performance.getEntriesByType("resource");
            const scripts = [...document.scripts].map((script) => script.src).filter(Boolean);
            const appScripts = scripts.filter((src) => appPattern.test(src));
            const navigation = performance.getEntriesByType("navigation")[0];
            const themeSections = [...document.querySelectorAll('[id^="shopify-section-"]')];
            const visibleSections = themeSections.filter((element) => {
              const rect = element.getBoundingClientRect();
              const style = getComputedStyle(element);
              return rect.width > 0 && rect.height > 0 && style.display !== "none";
            });
            const bodyText = document.body?.innerText ?? "";
            return {
              h1: text(document.querySelector("h1")),
              h2Count: [...document.querySelectorAll("h2")].filter((element) => text(element))
                .length,
              ctaCount: ctas.length,
              productLinkCount,
              ctaAboveFold: ctas.some(
                (item) => item.rect.top < innerHeight && item.rect.bottom > 0,
              ),
              sections: visibleSections.length,
              sectionIds: visibleSections.map((element) =>
                element.id.replace(/^shopify-section-/u, ""),
              ),
              reassurance: trustPattern.test(bodyText),
              loadTime: navigation ? navigation.loadEventEnd / 1000 : 0,
              assetWeight:
                resourceEntries.reduce((sum, entry) => sum + (entry.transferSize ?? 0), 0) /
                1_000_000,
              scripts,
              detectedApps: [...new Set(appScripts.map((src) => new URL(src).hostname))],
              bodyClass: document.body?.className ?? "",
              title: document.title,
              h2: [...document.querySelectorAll("h2")].map(text).filter(Boolean),
              prices: [
                ...document.querySelectorAll(
                  '[itemprop="price"], .price-item, [data-product-price]',
                ),
              ]
                .map((element) => text(element) || element.getAttribute("content") || "")
                .filter(Boolean)
                .slice(0, 12),
              variantCount: [
                ...document.querySelectorAll('select[name*="option"], select[name="id"] option'),
              ].reduce(
                (sum, element) => sum + (element.tagName === "SELECT" ? element.options.length : 1),
                0,
              ),
            };
          },
          {
            ctaSource: CTA_PATTERN.source,
            trustSource: TRUST_PATTERN.source,
            appSource: APP_PATTERN.source,
            productLinkSource: PRODUCT_LINK_PATTERN.source,
          },
        );

        const pathname = canonicalPath(finalUrl.href, site);
        const theme = matchThemeTemplate(pathname, signals.bodyClass, themeTemplates);
        const output = lpRecord(url, {
          dataCoverage: "multi-source",
          h1: signals.h1,
          h2Count: signals.h2Count,
          ctaCount: signals.ctaCount,
          ctaAboveFold: signals.ctaAboveFold,
          sections: signals.sections || theme.sections.length,
          shopSections: theme.sections.length ? theme.sections : signals.sectionIds,
          template: theme.template,
          dynamicSections: theme.dynamicSections,
          reassurance: signals.reassurance,
          loadTime: signals.loadTime,
          assetWeight: signals.assetWeight,
          shopifyMetadata: {
            title: signals.title,
            requestedUrl: url,
            finalUrl: finalUrl.href,
            httpStatus: response?.status() ?? null,
            h2: signals.h2,
            detectedApps: signals.detectedApps,
            scriptUrls: signals.scripts,
            prices: signals.prices,
            variantCount: signals.variantCount,
            productLinkCount: signals.productLinkCount,
            themeFiles: theme.themeFiles,
            themeStructure: theme.themeStructure,
            requestedUrlCount: urls.length,
            analyzedUrlCount: targets.length,
            truncated: urls.length > targets.length,
            lighthousePagesAudited: Math.min(targets.length, lighthouseMaxPages),
          },
        });

        if (index < lighthouseMaxPages) {
          try {
            const report = await lighthouse(url, {
              port: 9222,
              onlyCategories: ["performance", "accessibility", "best-practices", "seo"],
              logLevel: "error",
              output: "json",
              maxWaitForLoad: 30_000,
            });
            Object.assign(output, lighthouseScores(report));
          } catch (error) {
            output.lighthouseError = error instanceof Error ? error.message : "Lighthouse failed";
          }
        }

        results.push(output);
      } catch (error) {
        failures.push({
          url,
          error: error instanceof Error ? error.message : "Navigation or page inspection failed.",
        });
        continue;
      } finally {
        await page.close().catch(() => undefined);
      }
    }
  } finally {
    await browser.close();
  }

  if (results.length === 0) {
    throw new Error(
      `No LP was scraped. First failures: ${failures
        .slice(0, 3)
        .map((failure) => `${failure.url}: ${failure.error}`)
        .join("; ")}`,
    );
  }
  if (failures.length > 0) {
    for (const result of results) {
      result.shopifyMetadata.scrapeWarnings = failures;
    }
  }

  return results;
}
