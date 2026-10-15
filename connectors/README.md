# LP Radar data connectors

This standalone Node service runs outside the Vercel app because it launches Chromium. It exposes private adapter endpoints consumed by the authenticated LP Radar server:

- `POST /shopify`: scrapes same-storefront URLs with Playwright, maps an optional GitHub-synced Shopify theme, and runs Lighthouse for a bounded sample.
- `POST /ga4`: calls the official Google Analytics Data API for page sessions/views/conversions/revenue/engagement, funnel events, and session source/campaign attribution.
- `GET /health`: returns readiness flags only; it never returns credentials.

All adapter POSTs require a route-specific Bearer token and accept `{ "urls": ["https://store.example/pages/landing"] }`. URL inputs are restricted to `SHOPIFY_SITE_URL`'s origin. Shopify discovers same-origin public URLs from `/sitemap.xml` when the app sends no URL list. GA4 matches `pagePath` back to the requested original URL, including its ad query string.

The Shopify endpoint also accepts an optional `lighthouseMaxPages` value from 0 to 5. This lets integrations spread a large URL list across requests while running Lighthouse only on a small sample.

## Local setup

Use Node 22.19 or newer for Lighthouse 13.5, then install the service and Chromium:

```powershell
cd connectors
npm ci
npm run install:browser
```

Set the values in the current PowerShell session (never commit real values):

```powershell
$env:PORT = "8787"
$env:SHOPIFY_SITE_URL = "https://your-store.com"
$env:SHOPIFY_ADAPTER_TOKEN = Read-Host "Shopify adapter token"
$env:GA4_ADAPTER_TOKEN = Read-Host "GA4 adapter token"
$env:GA4_PROPERTY_ID = Read-Host "GA4 property ID"
$env:GOOGLE_APPLICATION_CREDENTIALS = "C:\secure\ga4-reader.json"
$env:SHOPIFY_MAX_PAGES = "40"
$env:SHOPIFY_LIGHTHOUSE_MAX_PAGES = "5"
# Optional on Windows if the Playwright browser download is blocked:
# $env:CHROME_EXECUTABLE_PATH = "C:\Program Files\Google\Chrome\Application\chrome.exe"
npm start
```

For local theme inspection, clone the Shopify GitHub-connected theme outside the application repository and set `SHOPIFY_THEME_DIR` to its root, the folder containing `templates/`, `sections/`, and `snippets/`. The service reads JSON templates from `templates/`; storefront scraping alone cannot read private Liquid files or Shopify metafields. Do not put a private theme or service-account key in this repository.

## GA4 authorization

1. Enable Google Analytics Data API in a Google Cloud project.
2. Create a service account and provide its JSON key through the host's secret store. For local development, `GOOGLE_APPLICATION_CREDENTIALS` may point to a protected file; hosted environments can use `GOOGLE_APPLICATION_CREDENTIALS_JSON` as a secret.
3. Add the service-account email to the GA4 property with Viewer/Analyst read access.
4. Set `GA4_PROPERTY_ID` to the numeric property ID, not the `properties/` prefix.

The reports use `pagePath`, `sessions`, `screenPageViews`, `conversions`, `purchaseRevenue`, and `engagementRate`, then query `view_item`, `add_to_cart`, `begin_checkout`, and `purchase` event counts plus `sessionSourceMedium` and `sessionCampaignId`. The default range is `90daysAgo` through `yesterday`; override with `GA4_START_DATE` and `GA4_END_DATE`.

## Deploy the connector service

Deploy this directory as a separate Docker web service on Render, Railway, Fly.io, or another Node host that supports Chromium. Use `connectors/Dockerfile`, expose port `8787`, and set the environment variables above in that host's secret settings. The host must provide HTTPS; do not expose the service over plain HTTP publicly. Configure the host's request timeout to allow the bounded Playwright/Lighthouse batch to finish.

The defaults cap storefront scraping at 40 LPs per analysis and Lighthouse at 5 LPs because Lighthouse is expensive. Increase these only after measuring the provider's request timeout and memory limits. The app sends higher-spend Google Ads URLs first.

## Connect LP Radar

In the LP Radar server environment (Vercel project settings), set:

```text
SHOPIFY_ADAPTER_URL=https://CONNECTOR_HOST/shopify
SHOPIFY_ADAPTER_TOKEN=<same value as connector SHOPIFY_ADAPTER_TOKEN>
GA4_ADAPTER_URL=https://CONNECTOR_HOST/ga4
GA4_ADAPTER_TOKEN=<same value as connector GA4_ADAPTER_TOKEN>
DATA_API_ALLOWED_HOSTS=CONNECTOR_HOST
ANALYSIS_MODE=live
```

`DATA_API_ALLOWED_HOSTS` contains only the hostname, without scheme, path, or trailing slash. Redeploy both the connector service and LP Radar after changing server variables. Keep `APP_ACCESS_PASSWORD` and `APP_SESSION_SECRET` configured on LP Radar as well.

When Google Ads credentials are configured, LP Radar posts those landing-page URLs first; Shopify and GA4 are merged by URL. GA4 conversions remain distinct from Google Ads conversions and CVR. Lighthouse scores and raw CWV remain separate fields. Shopify storefront scraping is limited to visible/public page data; private theme access is provided by the read-only theme directory, not by collaborator login scraping.

## Connect a Google Sheet

The Apps Script integration creates a separate `Shopify_Audit` tab while preserving the Google Ads columns from `LP_Detail`. It runs the crawl in short batches and limits Lighthouse to the first five URLs of the audit. See [`google-sheets/README.md`](./google-sheets/README.md) for setup and credentials.

## Checks

```sh
npm test
```

The tests validate URL/domain restrictions, theme template mapping, GA4 field mapping, and adapter token validation without requiring real provider credentials.
