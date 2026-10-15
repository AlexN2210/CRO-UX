import { createServer } from "node:http";
import { fetchGa4LandingPages } from "./ga4.mjs";
import { hasBearerToken, readJsonBody, sendJson } from "./shared.mjs";
import { scrapeShopifyLandingPages } from "./shopify.mjs";

const port = Number(process.env.PORT ?? 8787);

const server = createServer(async (request, response) => {
  const pathname = new URL(request.url ?? "/", "http://localhost").pathname;
  if (request.method === "GET" && pathname === "/health") {
    return sendJson(response, 200, {
      ok: true,
      configured: {
        shopify: Boolean(process.env.SHOPIFY_SITE_URL && process.env.SHOPIFY_ADAPTER_TOKEN),
        ga4: Boolean(process.env.GA4_PROPERTY_ID && process.env.GA4_ADAPTER_TOKEN),
      },
    });
  }

  const source = pathname === "/shopify" ? "shopify" : pathname === "/ga4" ? "ga4" : undefined;
  if (!source || request.method !== "POST")
    return sendJson(response, 404, { error: "Route introuvable." });
  const token =
    source === "shopify" ? process.env.SHOPIFY_ADAPTER_TOKEN : process.env.GA4_ADAPTER_TOKEN;
  if (!hasBearerToken(request, token))
    return sendJson(response, 401, { error: "Authentification refusée." });
  if (!(request.headers["content-type"] ?? "").toLowerCase().startsWith("application/json")) {
    return sendJson(response, 415, { error: "Content-Type application/json requis." });
  }

  try {
    const body = await readJsonBody(request);
    const urls = Array.isArray(body.urls) ? body.urls : [];
    if (
      source === "shopify" &&
      body.lighthouseMaxPages !== undefined &&
      (!Number.isInteger(body.lighthouseMaxPages) ||
        body.lighthouseMaxPages < 0 ||
        body.lighthouseMaxPages > 5)
    ) {
      return sendJson(response, 400, { error: "lighthouseMaxPages doit être compris entre 0 et 5." });
    }
    const lps =
      source === "shopify"
        ? await scrapeShopifyLandingPages({
            urls,
            ...(body.lighthouseMaxPages === undefined
              ? {}
              : {
                  env: {
                    ...process.env,
                    SHOPIFY_LIGHTHOUSE_MAX_PAGES: String(body.lighthouseMaxPages),
                  },
                }),
          })
        : await fetchGa4LandingPages({ urls });
    return sendJson(response, 200, { lps });
  } catch (error) {
    console.error(
      `${source} connector failed`,
      error instanceof Error ? error.message : "unknown error",
    );
    return sendJson(response, 502, {
      error: `Collecte ${source} impossible. Vérifie sa configuration côté serveur.`,
    });
  }
});

server.requestTimeout = 15 * 60 * 1000;
server.headersTimeout = 65_000;
server.listen(port, "0.0.0.0", () => {
  console.log(`LP Radar connectors listening on port ${port}`);
});
