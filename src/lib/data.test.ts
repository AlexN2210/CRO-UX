import { describe, it, expect } from "vitest";
import { recommendApproach, getLPs } from "./data";
import { createAnalysisPlan, getProductionConfig } from "./production";
import {
  fetchGoogleAdsLandingPages,
  getDataSourceStatus,
  loadAnalysisData,
  mapGoogleAdsRowsToLPs,
} from "./data-source";

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
      GOOGLE_ADS_DEVELOPER_TOKEN: "developer-token",
      GOOGLE_ADS_CLIENT_ID: "client-id",
      GOOGLE_ADS_CLIENT_SECRET: "client-secret",
      GOOGLE_ADS_REFRESH_TOKEN: "refresh-token",
      GOOGLE_ADS_CUSTOMER_ID: "1234567890",
      SHOPIFY_API_URL: "https://shop.example.com",
      SHOPIFY_ACCESS_TOKEN: "secret",
      ANALYSIS_MODE: "live",
    } as Record<string, string>);

    expect(config.googleAdsApiVersion).toBe("v25");
    expect(config.googleAdsDeveloperToken).toBe("developer-token");
    expect(config.googleAdsClientId).toBe("client-id");
    expect(config.googleAdsClientSecret).toBe("client-secret");
    expect(config.googleAdsRefreshToken).toBe("refresh-token");
    expect(config.googleAdsCustomerId).toBe("1234567890");
    expect(config.shopifyApiUrl).toBe("https://shop.example.com");
    expect(config.mode).toBe("live");
  });

  it("retourne un statut sans exposer les secrets", () => {
    const status = getDataSourceStatus({
      GOOGLE_ADS_DEVELOPER_TOKEN: "must-not-leak",
      GOOGLE_ADS_CLIENT_ID: "oauth-client-id",
      GOOGLE_ADS_CLIENT_SECRET: "oauth-client-secret",
      GOOGLE_ADS_REFRESH_TOKEN: "oauth-refresh-token",
      GOOGLE_ADS_CUSTOMER_ID: "1234567890",
      ANALYSIS_MODE: "hybrid",
    } as Record<string, string>);

    expect(status.readyForProduction).toBe(true);
    expect(status.configuredSources).toContain("Google Ads");
    expect(status.mode).toBe("hybrid");
    expect(JSON.stringify(status)).not.toContain("must-not-leak");
  });

  it("ignore une clé API classique Google Ads", () => {
    const status = getDataSourceStatus({
      GOOGLE_ADS_API_KEY: "not-a-valid-google-ads-credential",
      ANALYSIS_MODE: "live",
    } as Record<string, string>);

    expect(status.readyForProduction).toBe(false);
    expect(status.configuredSources).not.toContain("Google Ads");
  });

  it("agrège les métriques Google Ads par URL finale", () => {
    const lps = mapGoogleAdsRowsToLPs([
      {
        landingPageView: { unexpandedFinalUrl: "https://shop.example/products/a" },
        campaign: { name: "Search Brand" },
        metrics: { clicks: "100", impressions: "1000", costMicros: "1500000", conversions: "5" },
      },
      {
        landingPageView: { unexpandedFinalUrl: "https://shop.example/products/a" },
        campaign: { name: "Search Generic" },
        metrics: { clicks: "50", impressions: "1000", costMicros: "500000", conversions: "5" },
      },
    ]);

    expect(lps).toHaveLength(1);
    expect(lps[0].dataCoverage).toBe("sea-only");
    expect(lps[0].spend).toBe(2);
    expect(lps[0].clicks).toBe(150);
    expect(lps[0].impressions).toBe(2000);
    expect(lps[0].conversions).toBe(10);
    expect(lps[0].ctr).toBe(7.5);
    expect(lps[0].campaign).toBe("Search Brand · Search Generic");
  });

  it("rafraîchit le token OAuth et appelle Google Ads SearchStream", async () => {
    const config = getProductionConfig({
      GOOGLE_ADS_DEVELOPER_TOKEN: "developer-token",
      GOOGLE_ADS_CLIENT_ID: "client-id",
      GOOGLE_ADS_CLIENT_SECRET: "client-secret",
      GOOGLE_ADS_REFRESH_TOKEN: "refresh-token",
      GOOGLE_ADS_CUSTOMER_ID: "123-456-7890",
      GOOGLE_ADS_LOGIN_CUSTOMER_ID: "999-888-7777",
    });
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    const fetcher: typeof fetch = async (input, init) => {
      requests.push({ url: String(input), init });
      if (requests.length === 1) {
        return new Response(JSON.stringify({ access_token: "short-lived-access-token" }), {
          status: 200,
        });
      }
      return new Response(
        JSON.stringify([
          {
            results: [
              {
                landingPageView: { unexpandedFinalUrl: "https://shop.example/products/live" },
                campaign: { name: "Brand" },
                metrics: {
                  clicks: "10",
                  impressions: "100",
                  costMicros: "2500000",
                  conversions: "2",
                },
              },
            ],
          },
        ]),
        { status: 200 },
      );
    };

    const lps = await fetchGoogleAdsLandingPages(config, fetcher);

    expect(requests[0].url).toBe("https://oauth2.googleapis.com/token");
    expect(requests[1].url).toBe(
      "https://googleads.googleapis.com/v25/customers/1234567890/googleAds:searchStream",
    );
    const apiHeaders = new Headers(requests[1].init?.headers);
    expect(apiHeaders.get("authorization")).toBe("Bearer short-lived-access-token");
    expect(apiHeaders.get("developer-token")).toBe("developer-token");
    expect(apiHeaders.get("login-customer-id")).toBe("9998887777");
    expect(JSON.parse(String(requests[1].init?.body)).query).toContain("FROM landing_page_view");
    expect(lps[0].url).toBe("https://shop.example/products/live");
  });

  it("utilise la source demo si aucune API n'est branchée", async () => {
    const payload = await loadAnalysisData({ ANALYSIS_MODE: "demo" } as Record<string, string>);

    expect(payload.mode).toBe("demo");
    expect(payload.lps.length).toBeGreaterThan(0);
    expect(payload.connectedSources.length).toBe(0);
  });
});
