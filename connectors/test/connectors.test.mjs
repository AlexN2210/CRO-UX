import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fetchGa4LandingPages } from "../ga4.mjs";
import {
  canonicalPath,
  getAllowedStorefrontHosts,
  hasBearerToken,
  lpRecord,
  normalizeTargetUrls,
} from "../shared.mjs";
import { matchThemeTemplate, readThemeTemplates } from "../theme.mjs";

const siteUrl = "https://store.example";

test("only accepts target URLs on the configured storefront host", () => {
  assert.deepEqual(
    normalizeTargetUrls(
      [
        "https://store.example/pages/run?utm_source=ads",
        "https://attacker.example/steal",
        "/products/shoe",
      ],
      siteUrl,
    ),
    ["https://store.example/pages/run?utm_source=ads", "https://store.example/products/shoe"],
  );
  assert.equal(canonicalPath("/pages/run?utm_source=ads", siteUrl), "/pages/run");
});

test("preserves distinct storefront filter queries and product variant fragments", () => {
  assert.deepEqual(
    normalizeTargetUrls(
      [
        "/115-eviers",
        "/115-eviers?q=Mod%C3%A8le-1+bac-1+giga%5C-bac",
        "/115-eviers?q=Mod%C3%A8le-2+bacs",
        "/product.html#/85-couleur-blanc",
        "/product.html#/38-couleur-gris_beton",
      ],
      siteUrl,
    ),
    [
      "https://store.example/115-eviers",
      "https://store.example/115-eviers?q=Mod%C3%A8le-1+bac-1+giga%5C-bac",
      "https://store.example/115-eviers?q=Mod%C3%A8le-2+bacs",
      "https://store.example/product.html#/85-couleur-blanc",
      "https://store.example/product.html#/38-couleur-gris_beton",
    ],
  );
});

test("preserves allowed storefront domains and rejects other hosts", () => {
  const configuredSite = "https://shop.carea-cuisine-bain.fr";
  const allowedHosts = getAllowedStorefrontHosts(configuredSite);
  const germanStorefrontHosts = getAllowedStorefrontHosts(
    configuredSite,
    "carea-kueche-bad.de",
  );
  assert.equal(allowedHosts.has("www.carea-cuisine-bain.fr"), true);
  assert.equal(allowedHosts.has("unrelated.example"), false);
  assert.equal(germanStorefrontHosts.has("www.carea-kueche-bad.de"), true);
  assert.deepEqual(
    normalizeTargetUrls(
      [
        "https://www.carea-cuisine-bain.fr/115-eviers?q=Mod%C3%A8le-2+bacs#/dimension-90",
        "http://carea-kueche-bad.de/collections/spuelsteine",
        "https://unrelated.example/steal",
      ],
      configuredSite,
      40,
      germanStorefrontHosts,
    ),
    [
      "https://www.carea-cuisine-bain.fr/115-eviers?q=Mod%C3%A8le-2+bacs#/dimension-90",
      "https://carea-kueche-bad.de/collections/spuelsteine",
    ],
  );
});

test("LP records satisfy the app's normalized adapter contract", () => {
  const lp = lpRecord("https://store.example/pages/run", { h1: "Running shoes" });
  assert.equal(lp.url, "https://store.example/pages/run");
  assert.equal(lp.h1, "Running shoes");
  assert.equal(lp.dataCoverage, "multi-source");
  assert.ok(Array.isArray(lp.shopSections));
});

test("uses a GitHub-synced theme template when one matches the storefront template class", () => {
  const templates = new Map([
    ["page", { sections: ["hero", "faq"], dynamicSections: 1 }],
    ["page.landing", { sections: ["hero", "product-grid"], dynamicSections: 2 }],
  ]);
  assert.deepEqual(matchThemeTemplate("/pages/run", "template-page-landing", templates), {
    template: "page.landing",
    sections: ["hero", "product-grid"],
    dynamicSections: 2,
    themeFiles: [],
    themeStructure: undefined,
  });
});

test("reads template JSON and the section/snippet/config inventory from a theme checkout", async () => {
  const themeDirectory = await mkdtemp(path.join(os.tmpdir(), "lp-radar-theme-"));
  try {
    await Promise.all([
      mkdir(path.join(themeDirectory, "templates"), { recursive: true }),
      mkdir(path.join(themeDirectory, "sections"), { recursive: true }),
      mkdir(path.join(themeDirectory, "snippets"), { recursive: true }),
      mkdir(path.join(themeDirectory, "config"), { recursive: true }),
    ]);
    await Promise.all([
      writeFile(
        path.join(themeDirectory, "templates", "page.landing.json"),
        JSON.stringify({ sections: { hero: { type: "hero", blocks: { title: {} } } } }),
      ),
      writeFile(
        path.join(themeDirectory, "sections", "hero.liquid"),
        '<section></section>{% schema %}{"name":"Hero","settings":[{}],"blocks":[{"type":"button"}],"max_blocks":3}{% endschema %}',
      ),
      writeFile(path.join(themeDirectory, "snippets", "button.liquid"), "<button></button>"),
      writeFile(
        path.join(themeDirectory, "config", "settings_schema.json"),
        JSON.stringify([{ name: "Theme", settings: [{}, {}] }]),
      ),
      writeFile(
        path.join(themeDirectory, "config", "settings_data.json"),
        JSON.stringify({ current: { sections: { hero: {}, faq: {} } } }),
      ),
    ]);

    const templates = await readThemeTemplates(themeDirectory);
    const matched = matchThemeTemplate("/pages/run", "template-page-landing", templates);
    assert.deepEqual(matched.sections, ["hero"]);
    assert.equal(matched.dynamicSections, 1);
    assert.deepEqual(matched.themeFiles.sections, ["sections/hero.liquid"]);
    assert.deepEqual(matched.themeFiles.snippets, ["snippets/button.liquid"]);
    assert.equal(matched.themeFiles.config.length, 2);
    assert.deepEqual(matched.themeStructure.sectionSchemas, [
      {
        file: "sections/hero.liquid",
        name: "Hero",
        settingsCount: 1,
        blockTypes: ["button"],
        maxBlocks: 3,
      },
    ]);
    assert.equal(matched.themeStructure.globalSettingCount, 2);
    assert.equal(matched.themeStructure.configuredSectionCount, 2);
  } finally {
    await rm(themeDirectory, { recursive: true, force: true });
  }
});

test("maps GA4 sessions, revenue and funnel events back to the original ad URL", async () => {
  const reports = [
    [
      {
        rows: [
          {
            dimensionValues: [{ value: "/pages/run" }],
            metricValues: [
              { value: "100" },
              { value: "130" },
              { value: "4" },
              { value: "520" },
              { value: "0.5" },
            ],
          },
        ],
      },
    ],
    [
      {
        rows: [
          {
            dimensionValues: [{ value: "/pages/run" }, { value: "view_item" }],
            metricValues: [{ value: "70" }],
          },
          {
            dimensionValues: [{ value: "/pages/run" }, { value: "add_to_cart" }],
            metricValues: [{ value: "20" }],
          },
          {
            dimensionValues: [{ value: "/pages/run" }, { value: "begin_checkout" }],
            metricValues: [{ value: "8" }],
          },
          {
            dimensionValues: [{ value: "/pages/run" }, { value: "purchase" }],
            metricValues: [{ value: "4" }],
          },
        ],
      },
    ],
    [
      {
        rows: [
          {
            dimensionValues: [
              { value: "/pages/run" },
              { value: "google / cpc" },
              { value: "12345" },
            ],
            metricValues: [{ value: "100" }],
          },
        ],
      },
    ],
  ];
  const client = { runReport: async () => reports.shift() };
  const [lp] = await fetchGa4LandingPages({
    urls: ["https://store.example/pages/run?utm_campaign=brand"],
    env: { GA4_PROPERTY_ID: "123456", SHOPIFY_SITE_URL: siteUrl },
    client,
  });

  assert.equal(lp.url, "https://store.example/pages/run?utm_campaign=brand");
  assert.equal(lp.sessions, 100);
  assert.equal(lp.pageviews, 130);
  assert.equal(lp.conversions, 4);
  assert.equal(lp.cvRate, 4);
  assert.equal(lp.revenue, 520);
  assert.equal(lp.engagementRate, 50);
  assert.equal(lp.viewItemCount, 70);
  assert.equal(lp.addToCartCount, 20);
  assert.equal(lp.beginCheckoutCount, 8);
  assert.equal(lp.purchaseCount, 4);
  assert.deepEqual(lp.sourceMediums, ["google / cpc"]);
  assert.deepEqual(lp.campaignIds, ["12345"]);
});

test("requires a matching Bearer token", () => {
  const request = new Request("https://connectors.example/shopify", {
    headers: { authorization: "Bearer connector-secret" },
  });
  assert.equal(hasBearerToken(request, "connector-secret"), true);
  assert.equal(hasBearerToken(request, "wrong-secret"), false);
  assert.equal(
    hasBearerToken(
      new Request("https://connectors.example/shopify", {
        headers: { authorization: "connector-secret" },
      }),
      "connector-secret",
    ),
    false,
  );
  assert.equal(
    hasBearerToken(new Request("https://connectors.example/shopify"), "connector-secret"),
    false,
  );
});
