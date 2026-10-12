import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { getCurrentLPs, countTemplates, eur } from "@/lib/data";
import { PageHeader, Stat, Panel, DataTable, ScorePill } from "@/components/ui-kit";

export const Route = createFileRoute("/shopify")({
  head: () => ({
    meta: [
      { title: "Analyse Shopify — LP Radar" },
      {
        name: "description",
        content:
          "Templates, sections et metafields : mapping LP → template et score de scalabilité.",
      },
      { property: "og:title", content: "Analyse Shopify — LP Radar" },
      {
        property: "og:description",
        content: "Mapping LP → template → sections et score de scalabilité.",
      },
    ],
  }),
  component: ShopifyPage,
});

function ShopifyPage() {
  const lps = getCurrentLPs();
  const counts = Object.entries(countTemplates(lps)).sort((a, b) => b[1] - a[1]);
  const [open, setOpen] = useState(counts[0]?.[0] ?? "");
  if (lps.length > 0 && lps.every((lp) => lp.dataCoverage === "sea-only")) {
    return (
      <>
        <PageHeader kicker="Module 4 · Admin & Theme API" title="Analyse Shopify" />
        <Panel title="Connecteur requis">
          <p className="text-sm text-muted-foreground">
            Google Ads n’expose pas les templates, sections ou metafields Shopify. Ces résultats
            restent masqués jusqu’à la connexion Shopify.
          </p>
        </Panel>
      </>
    );
  }
  const shared = counts
    .filter(([t, c]) => c >= 10 && t !== "page.custom-legacy")
    .reduce((s, [, c]) => s + c, 0);
  const tplLps = lps.filter((l) => l.template === open);
  return (
    <>
      <PageHeader kicker="Module 4 · Admin & Theme API" title="Analyse Shopify" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Templates" value={counts.length} />
        <Stat
          label="LP sur template partagé"
          value={`${Math.round((shared / lps.length) * 100)} %`}
          hint={`${shared} LP`}
        />
        <Stat
          label="LP legacy"
          value={lps.filter((l) => l.template === "page.custom-legacy").length}
          hint="non modulaires"
        />
        <Stat
          label="Metafields moy."
          value={(lps.reduce((s, l) => s + l.metafields, 0) / lps.length).toFixed(1)}
        />
      </div>

      <Panel title="Visualisation template → LP" className="mt-6">
        <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
          <ul className="flex flex-col gap-2">
            {counts.map(([t, c]) => (
              <li key={t}>
                <button
                  onClick={() => setOpen(t)}
                  className={`w-full rounded-md border p-3 text-left transition-colors ${open === t ? "border-primary bg-muted" : "border-border hover:border-muted-foreground"}`}
                >
                  <div className="flex justify-between font-mono text-xs">
                    <span>{t}</span>
                    <span className="text-primary">{c}</span>
                  </div>
                  <div className="mt-2 h-1.5 rounded bg-secondary">
                    <div
                      className="h-full rounded bg-primary"
                      style={{ width: `${(c / counts[0][1]) * 100}%` }}
                    />
                  </div>
                </button>
              </li>
            ))}
          </ul>
          <div>
            <p className="kicker mb-3">
              {tplLps.length} LP · {eur(tplLps.reduce((s, l) => s + l.spend, 0))} de dépense
            </p>
            <div className="flex flex-wrap gap-1.5">
              {tplLps.map((l) => (
                <span
                  key={l.id}
                  title={`${l.url} — global ${l.scoreGlobal}`}
                  className={`rounded px-2 py-1 font-mono text-[10px] ${l.priority === "P1" ? "score-high" : l.priority === "P2" ? "score-mid" : "bg-secondary text-muted-foreground"}`}
                >
                  {l.url.replace("/pages/", "")}
                </span>
              ))}
            </div>
          </div>
        </div>
      </Panel>

      <h2 className="kicker mb-3 mt-10">Mapping LP → template → sections</h2>
      <DataTable
        rows={lps}
        csvName="shopify.csv"
        csvRow={(l) => ({
          LP: l.url,
          Template: l.template,
          Sections: l.shopSections,
          Metafields: l.metafields,
          Dynamiques: l.dynamicSections,
          ScoreShopify: l.scoreShopify,
        })}
        filters={[{ label: "Template", options: counts.map(([t]) => t), get: (l) => l.template }]}
        cols={[
          {
            key: "url",
            label: "LP",
            render: (l) => <span className="font-mono text-xs">{l.url}</span>,
          },
          {
            key: "template",
            label: "Template",
            render: (l) => <span className="font-mono text-xs">{l.template}</span>,
            sort: (l) => l.template,
          },
          {
            key: "sec",
            label: "Sections",
            render: (l) => (
              <span className="text-xs text-muted-foreground">{l.shopSections.join(", ")}</span>
            ),
          },
          {
            key: "mf",
            label: "Metafields",
            render: (l) => l.metafields,
            sort: (l) => l.metafields,
          },
          {
            key: "dyn",
            label: "Dynamiques",
            render: (l) => l.dynamicSections,
            sort: (l) => l.dynamicSections,
          },
          {
            key: "s",
            label: "Score Shopify",
            render: (l) => <ScorePill v={l.scoreShopify} quality />,
            sort: (l) => l.scoreShopify,
          },
        ]}
      />
    </>
  );
}
