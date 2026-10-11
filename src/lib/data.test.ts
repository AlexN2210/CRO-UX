import { describe, it, expect } from "vitest";
import { recommendApproach, getLPs } from "./data";
import { createAnalysisPlan, getProductionConfig } from "./production";
import { getDataSourceStatus, loadAnalysisData } from "./data-source";

describe("recommandation", () => {
  it("template quand la majorité partage un template", () => {
    expect(recommendApproach({ a: 80, b: 10, "page.custom-legacy": 10 }, 100)).toBe(
      "Optimisation template",
    );
  });
  it("individuelle quand les LP sont très différentes", () => {
    expect(recommendApproach({ a: 5, b: 5, c: 5, "page.custom-legacy": 85 }, 100)).toBe(
      "Optimisation individuelle",
    );
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

  it("lit les identifiants exclusivement depuis les variables serveur", () => {
    const config = getProductionConfig({
      GOOGLE_ADS_API_URL: "https://ads.example.com",
      GOOGLE_ADS_API_KEY: "secret",
      SHOPIFY_API_URL: "https://shop.example.com",
      SHOPIFY_ACCESS_TOKEN: "secret",
      ANALYSIS_MODE: "live",
    } as Record<string, string>);

    expect(config.googleAdsApiUrl).toBe("https://ads.example.com");
    expect(config.shopifyApiUrl).toBe("https://shop.example.com");
    expect(config.mode).toBe("live");
  });

  it("retourne un statut sans exposer les secrets", () => {
    const status = getDataSourceStatus({
      GOOGLE_ADS_API_URL: "https://ads.example.com",
      GOOGLE_ADS_API_KEY: "must-not-leak",
      ANALYSIS_MODE: "hybrid",
    } as Record<string, string>);

    expect(status.readyForProduction).toBe(false);
    expect(status.configuredSources).toContain("Google Ads");
    expect(status.mode).toBe("hybrid");
    expect(JSON.stringify(status)).not.toContain("must-not-leak");
  });

  it("utilise la source demo si aucune API n'est branchée", async () => {
    const payload = await loadAnalysisData({ ANALYSIS_MODE: "demo" } as Record<string, string>);

    expect(payload.mode).toBe("demo");
    expect(payload.lps.length).toBeGreaterThan(0);
    expect(payload.connectedSources.length).toBe(0);
  });
});
