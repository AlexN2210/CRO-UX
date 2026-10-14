import { afterEach, describe, expect, it, vi } from "vitest";
import server from "../server";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("endpoint analyse Google Ads", () => {
  it("utilise les credentials soumis pour cette requête sans les retourner", async () => {
    const env = {
      APP_ACCESS_PASSWORD: "test-password-longer-than-16",
      APP_SESSION_SECRET: "test-session-secret-longer-than-32-characters",
      ANALYSIS_MODE: "demo",
    };

    const login = await server.fetch(
      new Request("https://lp-radar.test/api/auth/login", {
        method: "POST",
        headers: {
          origin: "https://lp-radar.test",
          "content-type": "application/json",
        },
        body: JSON.stringify({ password: env.APP_ACCESS_PASSWORD }),
      }),
      env,
      {},
    );
    expect(login.status).toBe(200);
    const sessionCookie = login.headers.get("set-cookie")?.split(";")[0];
    expect(sessionCookie).toBeTruthy();

    const requests: Array<{ url: string; init?: RequestInit }> = [];
    const fetchMock: typeof fetch = async (input, init) => {
      requests.push({ url: String(input), init });
      if (requests.length === 1) {
        return new Response(JSON.stringify({ access_token: "one-time-access-token" }), {
          status: 200,
        });
      }
      return new Response(
        JSON.stringify([
          {
            results: [
              {
                landingPageView: { unexpandedFinalUrl: "https://store.example/products/a" },
                campaign: { name: "Campaign A" },
                metrics: {
                  clicks: "20",
                  impressions: "200",
                  costMicros: "4000000",
                  conversions: "2",
                },
              },
            ],
          },
        ]),
        { status: 200 },
      );
    };
    vi.stubGlobal("fetch", fetchMock);

    const secrets = {
      developer_token: "private-developer-token",
      client_id: "private-client-id",
      client_secret: "private-client-secret",
      refresh_token: "private-refresh-token",
      customer_id: "1234567890",
    };
    const analysis = await server.fetch(
      new Request("https://lp-radar.test/api/analysis", {
        method: "POST",
        headers: {
          origin: "https://lp-radar.test",
          cookie: sessionCookie!,
          "content-type": "application/json",
        },
        body: JSON.stringify({ googleAds: secrets }),
      }),
      env,
      {},
    );

    expect(analysis.status).toBe(200);
    const payload = (await analysis.json()) as {
      lps: Array<{ url: string; spend: number; clicks: number }>;
      connectedSources: string[];
    };
    expect(payload.connectedSources).toEqual(["Google Ads"]);
    expect(payload.lps).toHaveLength(1);
    expect(payload.lps[0]).toMatchObject({
      url: "https://store.example/products/a",
      spend: 4,
      clicks: 20,
    });
    expect(JSON.stringify(payload)).not.toContain(secrets.refresh_token);
    expect(JSON.stringify(payload)).not.toContain(secrets.client_secret);
    expect(requests.map((request) => request.url)).toEqual([
      "https://oauth2.googleapis.com/token",
      "https://googleads.googleapis.com/v25/customers/1234567890/googleAds:searchStream",
    ]);
  });
});
