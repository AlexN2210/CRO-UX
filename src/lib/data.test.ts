import { describe, it, expect } from "vitest";
import { recommendApproach, getLPs } from "./data";
import { createAnalysisPlan, getProductionConfig } from "./production";

describe("recommandation", () => {
  it("template quand la majorité partage un template", () => {
    expect(recommendApproach({ a: 80, b: 10, "page.custom-legacy": 10 }, 100)).toBe("Optimisation template");
  });
  it("individuelle quand les LP sont très différentes", () => {
    expect(recommendApproach({ a: 5, b: 5, c: 5, "page.custom-legacy": 85 }, 100)).toBe("Optimisation individuelle");
  });
  it("hybride sinon", () => {
    expect(recommendApproach({ a: 50, "page.custom-legacy": 50 }, 100)).toBe("Approche hybride");
  });
  it("traite 184 landing pages", () => {
    expect(getLPs()).toHaveLength(184);
  });

  it("produit un plan d'analyse prêt pour la production", () => {
    const plan = createAnalysisPlan(getLPs().slice(0, 10));

    expect(plan.prioritized.length).toBeGreaterThan(0);
    expect(plan.steps).toContain("Analyse SEA");
    expect(plan.steps).toContain("Audit CRO/UX");
    expect(plan.steps).toContain("Analyse Shopify");
    expect(plan.steps).toContain("Recommandation");
    expect(plan.steps).toContain("Devis");
  });

  it("lit la configuration production depuis les variables d'environnement", () => {
    const config = getProductionConfig({
      VITE_GOOGLE_ADS_API_URL: "https://ads.example.com",
      VITE_SHOPIFY_API_URL: "https://shop.example.com",
      VITE_ANALYSIS_MODE: "live",
    } as Record<string, string>);

    expect(config.googleAdsApiUrl).toBe("https://ads.example.com");
    expect(config.shopifyApiUrl).toBe("https://shop.example.com");
    expect(config.mode).toBe("live");
  });
});
