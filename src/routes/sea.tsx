import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip } from "recharts";
import { eur, weightedConversionRate } from "@/lib/data";
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
    "campaigns" | "keywords" | "searchTerms" | "landingPages" | "conversions" | "lpQuality" | "meta"
  >("landingPages");
  const seaOnly = lps.length > 0 && lps.every((lp) => lp.dataCoverage === "sea-only");
  const hasSpendData = lps.some((lp) => lp.spend > 0);
  const hasImpressionData = lps.some((lp) => lp.impressions > 0);
  const hasClickData = lps.some((lp) => lp.clicks > 0);
  const qualityPages = lps.filter((lp) => lp.qs > 0);
  const hasQualityData = qualityPages.length > 0;
  const spend = lps.reduce((s, l) => s + l.spend, 0);
  const avg = (f: (l: (typeof lps)[0]) => number) =>
    (lps.reduce((s, l) => s + f(l), 0) / lps.length).toFixed(1);
  const overallCvr = weightedConversionRate(lps);
  const avgQuality = hasQualityData
    ? (qualityPages.reduce((total, lp) => total + lp.qs, 0) / qualityPages.length).toFixed(1)
    : "N/D";
  const qsDist = Array.from({ length: 10 }, (_, i) => ({
    qs: i + 1,
    n: qualityPages.filter((lp) => Math.round(lp.qs) === i + 1).length,
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
      {csvBundle && (
        <Panel className="mb-6" title="Import Google Ads terminé">
          <p className="text-sm text-muted-foreground">
            {[
              `${csvBundle.lps.length} landing pages analysées`,
              `${csvBundle.campaigns.length} campagnes`,
              `${csvBundle.keywords.length} mots-clés`,
              `${csvBundle.searchTerms.length} requêtes`,
              `${csvBundle.landingPages.length} lignes de pages de destination`,
              `${csvBundle.conversions.length} lignes de conversions`,
              `${csvBundle.lpQuality.length} lignes LP_Quality`,
              `${csvBundle.meta.length} lignes Meta`,
            ].join(" · ")}
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            Cette importation couvre le SEA. Les audits CRO/UX, Shopify, GA4 et vitesse nécessitent
            leurs propres données.
          </p>
          {csvBundle.warnings.map((warning) => (
            <p key={warning} className="mt-2 text-sm text-muted-foreground">
              {warning}
            </p>
          ))}
        </Panel>
      )}
      {seaOnly && (
        <Panel
          className="mb-6"
          title={
            csvBundle ? "Données des exports Google Ads" : "Données Google Ads · 30 derniers jours"
          }
        >
          <p className="text-sm text-muted-foreground">
            {csvBundle
              ? "Les métriques ci-dessous sont calculées à partir des sept exports importés. Le Quality Score et l’expérience LP sont affichés lorsqu’ils sont présents dans LP_Quality."
              : "Seuls les clics, impressions, dépenses, CTR et conversions ci-dessous sont fournis par le rapport Google Ads Landing Page View."}
          </p>
        </Panel>
      )}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          label="Dépense"
          value={hasSpendData ? eur(spend) : "N/D"}
          hint={hasSpendData ? undefined : "Colonne de dépense non reconnue"}
        />
        <Stat
          label="QS moyen"
          value={avgQuality}
          hint={hasQualityData ? "/10" : "Non fourni ou non reconnu"}
        />
        <Stat
          label="CTR moyen"
          value={hasImpressionData ? `${avg((l) => l.ctr)} %` : "N/D"}
          hint={hasImpressionData ? undefined : "Colonne Impressions non reconnue"}
        />
        <Stat
          label="CVR moyen"
          value={overallCvr === null ? "N/D" : `${overallCvr.toFixed(1)} %`}
          hint={hasClickData ? "Conversions / clics" : "Colonne Clics non reconnue"}
        />
      </div>
      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        {!hasQualityData ? (
          <Panel title="Quality Score indisponible">
            <p className="text-sm text-muted-foreground">
              {csvBundle
                ? "Aucun Quality Score reconnu dans les exports LP_Quality ou Keywords."
                : "La ressource Landing Page View ne retourne pas le Quality Score."}
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
          {hasSpendData ? (
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
          ) : (
            <p className="text-sm text-muted-foreground">
              Aucune dépense reconnue. Consulte l’avertissement d’import pour les colonnes
              détectées.
            </p>
          )}
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
                ...(hasQualityData ? { QS: l.qs, LPExp: l.lpExp } : {}),
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
          ...(hasQualityData
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
          ...(hasQualityData
            ? [
                { key: "qs", label: "QS", sort: (l: (typeof lps)[number]) => l.qs },
                { key: "lpExp", label: "LP Exp", sort: (l: (typeof lps)[number]) => l.lpExp },
              ]
            : []),
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
                ["conversions", `Conversions (${csvBundle.conversions.length})`],
                ["lpQuality", `LP_Quality (${csvBundle.lpQuality.length})`],
                ["meta", `Meta (${csvBundle.meta.length})`],
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
