import { afterEach, describe, it, expect, vi } from "vitest";
import { recommendApproach, getLPs } from "./data";
import { createAnalysisPlan, getProductionConfig } from "./production";
import { createGoogleAdsCsvBundle, parseGoogleAdsCsv } from "./google-ads-csv";
import {
  fetchGoogleAdsLandingPages,
  getDataSourceStatus,
  loadAnalysisData,
  mapGoogleAdsRowsToLPs,
} from "./data-source";
import { buildUnifiedLpDataset } from "./data-fusion";

afterEach(() => {
  vi.unstubAllGlobals();
});

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
      SHOPIFY_ADAPTER_URL: "https://adapter.example.com/shopify",
      SHOPIFY_ADAPTER_TOKEN: "adapter-secret",
      ANALYSIS_MODE: "live",
    } as Record<string, string>);

    expect(config.googleAdsApiVersion).toBe("v25");
    expect(config.googleAdsDeveloperToken).toBe("developer-token");
    expect(config.googleAdsClientId).toBe("client-id");
    expect(config.googleAdsClientSecret).toBe("client-secret");
    expect(config.googleAdsRefreshToken).toBe("refresh-token");
    expect(config.googleAdsCustomerId).toBe("1234567890");
    expect(config.shopifyAdapterUrl).toBe("https://adapter.example.com/shopify");
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
    expect(status.statusLabel).toBe("configuré");
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

  it("lit les CSV Google Ads FR et agrège les exports des quatre onglets", () => {
    expect(parseGoogleAdsCsv('Campagne;Clics\n"Brand, France";12')).toEqual([
      { Campagne: "Brand, France", Clics: "12" },
    ]);
    const bundle = createGoogleAdsCsvBundle({
      campaigns: 'Campagne;Clics;Impressions;Coût\n"Brand, France";120;2400;36,50',
      keywords:
        "Mot clé;Landing page URL;Quality Score;Exp. landing page\nchaussures running;https://store.example/pages/run;7;Supérieur à la moyenne",
      searchTerms:
        'Requête de recherche;Clics;Impressions;Conversions\n"chaussures running femme";18;300;2',
      landingPages:
        "Landing page URL;Campagne;Clics;Impressions;Conversions;Coût\nhttps://store.example/pages/run;Brand;100;2000;8;25,50",
    });

    expect(bundle.campaigns).toHaveLength(1);
    expect(bundle.campaigns[0].Campagne).toBe("Brand, France");
    expect(bundle.keywords).toHaveLength(1);
    expect(bundle.searchTerms).toHaveLength(1);
    expect(bundle.landingPages).toHaveLength(1);
    expect(bundle.lps).toHaveLength(1);
    expect(bundle.lps[0]).toMatchObject({
      url: "https://store.example/pages/run",
      spend: 25.5,
      clicks: 100,
      impressions: 2000,
      conversions: 8,
      qs: 7,
      dataCoverage: "sea-only",
    });
  });

  it("renvoie une erreur explicite quand aucun CSV ne contient d’URL finale", () => {
    expect(() =>
      createGoogleAdsCsvBundle({
        campaigns: "Campaign;Clicks\nBrand;50",
        searchTerms: "Search term;Clicks\nrunning shoes;10",
      }),
    ).toThrow("Les colonnes détectées sont : Campaign, Clicks, Search term");
  });

  it("reconnaît les variantes d’en-tête Google Ads et les domaines sans protocole", () => {
    const bundle = createGoogleAdsCsvBundle({
      landingPages:
        "URL finale développée;Campagne;Clics;Impressions;Conversions;Coût\nwww.store.example/pages/run;Brand;100;2000;8;25,50",
    });

    expect(bundle.lps).toHaveLength(1);
    expect(bundle.lps[0].url).toBe("https://www.store.example/pages/run");
    expect(bundle.lps[0].spend).toBe(25.5);
  });

  it("importe les sept exports Google Ads Script et rattache conversions et LP Quality par URL", () => {
    const bundle = createGoogleAdsCsvBundle({
      campaigns: "Campaign;Landing page URL;Clicks\nBrand;https://store.example/run;100",
      keywords: "Keyword;Landing page URL;Clicks\nrun shoes;https://store.example/run;50",
      searchTerms: "Search term;Landing page URL;Clicks\nshoes;https://store.example/run;30",
      landingPages: "Final URL;Clicks;Impressions;Cost\nhttps://store.example/run;100;2000;25",
      conversions: "Landing page URL;Conversions\nhttps://store.example/run;12",
      lpQuality:
        "Landing page URL;Quality Score;Landing page experience\nhttps://store.example/run;8;Above average",
      meta: "Landing page URL;Title;Description\nhttps://store.example/run;Running shoes;Shop running",
    });

    expect(bundle.conversions).toHaveLength(1);
    expect(bundle.lpQuality).toHaveLength(1);
    expect(bundle.meta).toHaveLength(1);
    expect(bundle.lps).toHaveLength(1);
    expect(bundle.lps[0]).toMatchObject({
      url: "https://store.example/run",
      conversions: 12,
      qs: 8,
      lpExp: "Au-dessus",
    });
  });

  it("appelle les adaptateurs autorisés avec leur token privé et exige le format LP normalisé", async () => {
    const sourceLp = { ...getLPs()[0], id: 71, url: "https://store.example/pages/live" };
    const fetchMock = vi.fn<typeof fetch>(async (_input, init) => {
      expect(new Headers(init?.headers).get("authorization")).toBe("Bearer adapter-only-token");
      expect(new Headers(init?.headers).get("x-shopify-access-token")).toBeNull();
      return new Response(JSON.stringify({ lps: [sourceLp] }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await loadAnalysisData({
      ANALYSIS_MODE: "live",
      SHOPIFY_ADAPTER_URL: "https://adapter.example.com/shopify",
      SHOPIFY_ADAPTER_TOKEN: "adapter-only-token",
      DATA_API_ALLOWED_HOSTS: "adapter.example.com",
    });

    expect(result.lps).toEqual([sourceLp]);
    expect(result.connectedSources).toEqual(["Shopify Admin"]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
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

  it("fusionne les données Google Ads, Shopify, GA4 et Speed par URL", () => {
    const dataset = buildUnifiedLpDataset({
      googleAds: [
        {
          url: "https://shop.example/products/run",
          campaign: "Brand",
          spend: 120,
          clicks: 800,
          impressions: 9000,
          conversions: 12,
          ctr: 8.89,
          cvr: 1.5,
          cpc: 0.15,
          qs: 7,
          lpExp: "Moyenne",
          keywords: ["chaussures running"],
          scoreSEA: 68,
        },
      ],
      shopify: [
        {
          url: "https://shop.example/products/run",
          template: "page.landing-produit",
          shopSections: ["hero", "product-grid", "testimonials"],
          metafields: 8,
          dynamicSections: 3,
          ctaCount: 3,
          ctaAboveFold: true,
          h2Count: 4,
          reassurance: true,
          sections: 6,
          scrollDepth: 70,
        },
      ],
      ga4: [
        {
          url: "https://shop.example/products/run",
          sessions: 2500,
          pageviews: 3000,
          conversions: 35,
          cvRate: 1.4,
          revenue: 4200,
          engagementRate: 52,
        },
      ],
      speed: [
        {
          url: "https://shop.example/products/run",
          lcp: 2.1,
          cls: 0.08,
          inp: 150,
        },
      ],
    });

    expect(dataset).toHaveLength(1);
    expect(dataset[0]).toMatchObject({
      url: "https://shop.example/products/run",
      template: "page.landing-produit",
      spend: 120,
      sessions: 2500,
      revenue: 4200,
      scoreSEA: 68,
    });
    expect(dataset[0].scoreShopify).toBeGreaterThan(0);
    expect(dataset[0].scoreGlobal).toBeGreaterThan(0);
    expect(dataset[0].priority).toMatch(/P1|P2|P3/);
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
