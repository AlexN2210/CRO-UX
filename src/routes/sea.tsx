import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip } from "recharts";
import { eur } from "@/lib/data";
import { getCurrentLPs, getImportedGoogleAdsCsv } from "@/lib/analysis-session";
import { PageHeader, Stat, Panel, DataTable, ScorePill } from "@/components/ui-kit";
import type { GoogleAdsCsvRow } from "@/lib/google-ads-csv";

export const Route = createFileRoute("/sea")({
  head: () => ({
    meta: [
      { title: "Analyse SEA — LP Radar" },
      {
        name: "description",
        content:
          "Dépenses, Quality Score, expérience LP et conversion par landing page Google Ads.",
      },
      { property: "og:title", content: "Analyse SEA — LP Radar" },
      {
        property: "og:description",
        content: "Dépenses, Quality Score, expérience LP et conversion par landing page.",
      },
    ],
  }),
  component: SeaPage,
});

function SeaPage() {
  const lps = getCurrentLPs();
  const csvBundle = getImportedGoogleAdsCsv();
  const [activeCsvTab, setActiveCsvTab] = useState<
    "campaigns" | "keywords" | "searchTerms" | "landingPages"
  >("landingPages");
  const seaOnly = lps.length > 0 && lps.every((lp) => lp.dataCoverage === "sea-only");
  const spend = lps.reduce((s, l) => s + l.spend, 0);
  const avg = (f: (l: (typeof lps)[0]) => number) =>
    (lps.reduce((s, l) => s + f(l), 0) / lps.length).toFixed(1);
  const qsDist = Array.from({ length: 10 }, (_, i) => ({
    qs: i + 1,
    n: lps.filter((l) => l.qs === i + 1).length,
  }));
  const camps = Object.entries(
    lps.reduce<Record<string, number>>(
      (a, l) => ((a[l.campaign] = (a[l.campaign] ?? 0) + l.spend), a),
      {},
    ),
  ).map(([c, s]) => ({ c, s }));
  const tip = {
    contentStyle: {
      background: "var(--card)",
      border: "1px solid var(--border)",
      borderRadius: 8,
      fontSize: 12,
    },
  };

  return (
    <>
      <PageHeader kicker="Module 2 · Google Ads" title="Analyse SEA" />
      {seaOnly && (
        <Panel className="mb-6" title="Données Google Ads · 30 derniers jours">
          <p className="text-sm text-muted-foreground">
            Les valeurs Quality Score et expérience de la page ne sont pas fournies par le rapport
            Landing Page View. Seuls les clics, impressions, dépenses, CTR et conversions ci-dessous
            sont issus de Google Ads.
          </p>
        </Panel>
      )}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Dépense" value={eur(spend)} />
        <Stat
          label="QS moyen"
          value={seaOnly ? "N/D" : avg((l) => l.qs)}
          hint={seaOnly ? "Non fourni par cette requête" : "/10"}
        />
        <Stat label="CTR moyen" value={`${avg((l) => l.ctr)} %`} />
        <Stat
          label="CVR moyen"
          value={`${avg((l) => l.cvr)} %`}
          hint={seaOnly ? "Conversions / clics" : undefined}
        />
      </div>
      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        {seaOnly ? (
          <Panel title="Quality Score indisponible">
            <p className="text-sm text-muted-foreground">
              La ressource Landing Page View ne retourne pas le Quality Score.
            </p>
          </Panel>
        ) : (
          <Panel title="Distribution du Quality Score">
            <div className="h-56">
              <ResponsiveContainer>
                <BarChart data={qsDist}>
                  <XAxis dataKey="qs" stroke="var(--muted-foreground)" fontSize={11} />
                  <YAxis stroke="var(--muted-foreground)" fontSize={11} />
                  <Tooltip {...tip} cursor={{ fill: "var(--muted)" }} />
                  <Bar dataKey="n" name="LP" fill="var(--chart-1)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Panel>
        )}
        <Panel title="Dépense par campagne">
          <div className="h-56">
            <ResponsiveContainer>
              <BarChart data={camps} layout="vertical">
                <XAxis type="number" stroke="var(--muted-foreground)" fontSize={11} />
                <YAxis
                  type="category"
                  dataKey="c"
                  width={150}
                  stroke="var(--muted-foreground)"
                  fontSize={11}
                />
                <Tooltip {...tip} cursor={{ fill: "var(--muted)" }} />
                <Bar dataKey="s" name="€" fill="var(--chart-2)" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      </div>
      <h2 className="kicker mb-3 mt-10">Landing pages Search</h2>
      <DataTable
        rows={lps}
        csvName="sea.csv"
        csvRow={(l) =>
          seaOnly
            ? {
                LP: l.url,
                Campagne: l.campaign,
                Depense: l.spend,
                Clics: l.clicks,
                Impressions: l.impressions,
                Conversions: l.conversions,
                CTR: l.ctr,
                CVR: l.cvr,
                CPC: l.cpc,
              }
            : {
                LP: l.url,
                Campagne: l.campaign,
                Spend: l.spend,
                QS: l.qs,
                LPExp: l.lpExp,
                CVR: l.cvr,
                CTR: l.ctr,
                CPC: l.cpc,
                Keywords: l.keywords,
                ScoreSEA: l.scoreSEA,
              }
        }
        filters={[
          {
            label: "Campagne",
            options: [...new Set(lps.map((l) => l.campaign))],
            get: (l) => l.campaign,
          },
          ...(!seaOnly
            ? [
                {
                  label: "LP Exp",
                  options: ["Au-dessus", "Moyenne", "En dessous"],
                  get: (l: (typeof lps)[number]) => l.lpExp,
                },
              ]
            : []),
        ]}
        cols={[
          {
            key: "url",
            label: "LP",
            render: (l) => <span className="font-mono text-xs">{l.url}</span>,
          },
          { key: "spend", label: "Spend", render: (l) => eur(l.spend), sort: (l) => l.spend },
          ...(seaOnly
            ? []
            : [
                { key: "qs", label: "QS", sort: (l: (typeof lps)[number]) => l.qs },
                { key: "lpExp", label: "LP Exp", sort: (l: (typeof lps)[number]) => l.lpExp },
              ]),
          ...(seaOnly
            ? [
                { key: "clicks", label: "Clics", sort: (l: (typeof lps)[number]) => l.clicks },
                {
                  key: "impressions",
                  label: "Impressions",
                  sort: (l: (typeof lps)[number]) => l.impressions,
                },
                {
                  key: "conversions",
                  label: "Conversions",
                  sort: (l: (typeof lps)[number]) => l.conversions ?? 0,
                },
              ]
            : []),
          { key: "cvr", label: "CVR %", sort: (l) => l.cvr },
          { key: "ctr", label: "CTR %", sort: (l) => l.ctr },
          { key: "cpc", label: "CPC €", sort: (l) => l.cpc },
          {
            key: "kw",
            label: "Mots-clés",
            render: (l) => (
              <span className="text-xs text-muted-foreground">{l.keywords.join(", ")}</span>
            ),
          },
          {
            key: "s",
            label: "Score SEA",
            render: (l) => <ScorePill v={l.scoreSEA} />,
            sort: (l) => l.scoreSEA,
          },
        ]}
      />
      {csvBundle && (
        <Panel className="mt-10" title="Détails des onglets Google Ads importés">
          <div
            className="mb-4 flex flex-wrap gap-2"
            role="tablist"
            aria-label="Onglets CSV Google Ads"
          >
            {(
              [
                ["campaigns", `Campagnes (${csvBundle.campaigns.length})`],
                ["keywords", `Mots-clés (${csvBundle.keywords.length})`],
                ["searchTerms", `Requêtes (${csvBundle.searchTerms.length})`],
                ["landingPages", `Landing pages (${csvBundle.landingPages.length})`],
              ] as const
            ).map(([tab, label]) => (
              <button
                key={tab}
                type="button"
                role="tab"
                aria-selected={activeCsvTab === tab}
                onClick={() => setActiveCsvTab(tab)}
                className={`rounded-md border px-3 py-2 text-sm ${activeCsvTab === tab ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground"}`}
              >
                {label}
              </button>
            ))}
          </div>
          <GoogleAdsCsvTable rows={csvBundle[activeCsvTab]} />
        </Panel>
      )}
    </>
  );
}

function GoogleAdsCsvTable({ rows }: { rows: GoogleAdsCsvRow[] }) {
  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">Aucune ligne importée pour cet onglet.</p>;
  }

  const columns = Object.keys(rows[0]);
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left">
            {columns.map((column) => (
              <th key={column} className="kicker whitespace-nowrap px-3 py-2">
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, 500).map((row, index) => (
            <tr key={index} className="border-b border-border/60">
              {columns.map((column) => (
                <td key={column} className="whitespace-nowrap px-3 py-2">
                  {row[column]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length > 500 && (
        <p className="mt-3 text-xs text-muted-foreground">
          Affichage limité aux 500 premières lignes; export fourni en totalité reste importé en
          mémoire de session.
        </p>
      )}
    </div>
  );
}
