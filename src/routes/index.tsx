import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import {
  ResponsiveContainer,
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  ZAxis,
  Tooltip,
  CartesianGrid,
  BarChart,
  Bar,
  Cell,
} from "recharts";
import { getCurrentLPs, setCurrentLPs, estimate, eur } from "@/lib/data";
import { PageHeader, Stat, Panel, DataTable, ScorePill } from "@/components/ui-kit";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Dashboard — LP Radar" },
      {
        name: "description",
        content: "Vue d'ensemble des 184 landing pages : dépenses, scores et priorités.",
      },
      { property: "og:title", content: "Dashboard — LP Radar" },
      {
        property: "og:description",
        content: "Vue d'ensemble des 184 landing pages : dépenses, scores et priorités.",
      },
    ],
  }),
  component: Dashboard,
});

const tip = {
  contentStyle: {
    background: "var(--card)",
    border: "1px solid var(--border)",
    borderRadius: 8,
    fontSize: 12,
  },
};

type AppPath = "/" | "/sea" | "/cro" | "/shopify" | "/recommandation" | "/rapport" | "/devis";

function Dashboard() {
  const [analysisLps, setAnalysisLps] = useState(getCurrentLPs());
  const [analysisMessage, setAnalysisMessage] = useState(
    "Les chiffres affichés sont des données démo jusqu’au lancement de l’analyse.",
  );
  const [isLaunching, setIsLaunching] = useState(false);
  const lps = analysisLps;
  const seaOnly = lps.length > 0 && lps.every((lp) => lp.dataCoverage === "sea-only");
  const est = estimate(lps);
  const spend = lps.reduce((s, l) => s + l.spend, 0);
  const p1Spend = est.p1.reduce((s, l) => s + l.spend, 0);
  const prio = (["P1", "P2", "P3"] as const).map((p) => ({
    p,
    n: lps.filter((l) => l.priority === p).length,
  }));

  const handleLaunchAnalysis = async () => {
    setIsLaunching(true);
    try {
      const response = await fetch("/api/analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      const result = (await response.json()) as {
        lps?: typeof lps;
        connectedSources?: string[];
        error?: string;
      };
      if (!response.ok) throw new Error(result.error ?? "L’analyse a échoué.");
      if (result.lps) {
        setCurrentLPs(result.lps);
        setAnalysisLps(result.lps);
      }
      setAnalysisMessage(
        `Analyse terminée : ${result.lps?.length ?? 0} LP · ${(result.connectedSources ?? []).join(" · ") || "données démo"}.`,
      );
    } catch (error) {
      setAnalysisMessage(error instanceof Error ? error.message : "Erreur pendant l’analyse.");
    } finally {
      setIsLaunching(false);
    }
  };

  return (
    <>
      <PageHeader kicker="Vue d'ensemble" title="Dashboard">
        <Link to="/rapport" className="btn-primary">
          Voir le rapport
        </Link>
      </PageHeader>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          label="Landing pages"
          value={lps.length}
          hint={
            seaOnly
              ? "URLs Google Ads · 30 jours"
              : `${Object.keys(est.counts).length} templates Shopify`
          }
        />
        <Stat label="Dépense totale" value={eur(spend)} hint="30 derniers jours" />
        <Stat
          label={seaOnly ? "Opportunités SEA (P1)" : "LP prioritaires (P1)"}
          value={est.p1.length}
          hint={`${Math.round((p1Spend / spend) * 100)} % de la dépense`}
        />
        <Stat
          label={seaOnly ? "Couverture" : "Approche"}
          value={
            <span className="text-primary text-2xl">
              {seaOnly ? "SEA seulement" : est.approach}
            </span>
          }
          hint={seaOnly ? "CRO/UX et Shopify non analysés" : `${est.days} j · ${eur(est.budget)}`}
        />
      </div>

      <Panel className="mt-6" title="Analyse sécurisée">
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-primary" role="status">
            {analysisMessage}
          </p>
          <button
            type="button"
            className="btn-primary"
            onClick={handleLaunchAnalysis}
            disabled={isLaunching}
          >
            {isLaunching ? "Analyse en cours..." : "Lancer l'analyse"}
          </button>
        </div>
      </Panel>

      {seaOnly && (
        <Panel className="mt-6" title="Périmètre des données reçues">
          <p className="text-sm text-muted-foreground">
            Google Ads fournit ici les URLs, clics, impressions, dépenses et conversions. Le Quality
            Score, les mesures CRO/UX et les données Shopify ne sont pas renvoyés par cette requête.
          </p>
        </Panel>
      )}

      <Panel className="mt-6" title="Workflow de l’analyse">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          {[
            {
              step: "1",
              label: "Analyse SEA",
              target: "/sea",
              details: "Dépenses, QS, LP Exp, priorisation",
            },
            {
              step: "2",
              label: "Audit CRO/UX",
              target: "/cro",
              details: "Structure, CTA, friction, parcours mobile",
            },
            {
              step: "3",
              label: "Shopify",
              target: "/shopify",
              details: "Templates, sections, scalabilité",
            },
            {
              step: "4",
              label: "Recommandation",
              target: "/recommandation",
              details: "Approche, périmètre, budget, wireframes",
            },
            {
              step: "5",
              label: "Devis",
              target: "/devis",
              details: "Phase 2, planning, livrables",
            },
          ].map((item) => (
            <Link
              key={item.step}
              to={item.target as AppPath}
              className="rounded-md border border-border p-4 transition-colors hover:border-primary/60 hover:bg-muted/40"
            >
              <p className="font-mono text-xs text-primary">Étape {item.step}</p>
              <p className="mt-2 font-medium">{item.label}</p>
              <p className="mt-1 text-xs text-muted-foreground">{item.details}</p>
            </Link>
          ))}
        </div>
      </Panel>

      {!seaOnly && (
        <div className="mt-6 grid gap-4 lg:grid-cols-3">
          <Panel title="Dépense × score CRO/UX (taille = score global)" className="lg:col-span-2">
            <div className="h-80">
              <ResponsiveContainer>
                <ScatterChart margin={{ left: 0, right: 10, top: 10 }}>
                  <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
                  <XAxis
                    dataKey="spend"
                    name="Dépense"
                    unit="€"
                    stroke="var(--muted-foreground)"
                    fontSize={11}
                  />
                  <YAxis
                    dataKey="scoreCRO"
                    name="CRO/UX"
                    stroke="var(--muted-foreground)"
                    fontSize={11}
                  />
                  <ZAxis dataKey="scoreGlobal" range={[20, 220]} name="Global" />
                  <Tooltip {...tip} cursor={{ strokeDasharray: "3 3" }} />
                  <Scatter data={lps}>
                    {lps.map((l) => (
                      <Cell
                        key={l.id}
                        fill={
                          l.priority === "P1"
                            ? "var(--destructive)"
                            : l.priority === "P2"
                              ? "var(--warn)"
                              : "var(--chart-5)"
                        }
                        fillOpacity={0.75}
                      />
                    ))}
                  </Scatter>
                </ScatterChart>
              </ResponsiveContainer>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              En bas à droite : fortes dépenses, faible expérience — à traiter en premier.
            </p>
          </Panel>
          <Panel title="Répartition des priorités">
            <div className="h-80">
              <ResponsiveContainer>
                <BarChart data={prio}>
                  <XAxis dataKey="p" stroke="var(--muted-foreground)" fontSize={12} />
                  <YAxis stroke="var(--muted-foreground)" fontSize={11} />
                  <Tooltip {...tip} cursor={{ fill: "var(--muted)" }} />
                  <Bar dataKey="n" name="LP" radius={[4, 4, 0, 0]}>
                    {prio.map((p) => (
                      <Cell
                        key={p.p}
                        fill={
                          p.p === "P1"
                            ? "var(--destructive)"
                            : p.p === "P2"
                              ? "var(--warn)"
                              : "var(--chart-5)"
                        }
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Panel>
        </div>
      )}

      <h2 className="kicker mb-3 mt-10">Priorisation globale</h2>
      <DataTable
        rows={[...lps].sort((a, b) => b.scoreGlobal - a.scoreGlobal)}
        csvName="priorisation.csv"
        csvRow={(l) =>
          seaOnly
            ? {
                LP: l.url,
                Depense: l.spend,
                Clics: l.clicks,
                Impressions: l.impressions,
                CTR: l.ctr,
                Conversions: l.conversions,
                CVR: l.cvr,
              }
            : {
                LP: l.url,
                SEA: l.scoreSEA,
                CRO: l.scoreCRO,
                Shopify: l.scoreShopify,
                Global: l.scoreGlobal,
                Priorite: l.priority,
              }
        }
        filters={[{ label: "Priorité", options: ["P1", "P2", "P3"], get: (l) => l.priority }]}
        cols={[
          {
            key: "url",
            label: "LP",
            render: (l) => <span className="font-mono text-xs">{l.url}</span>,
          },
          { key: "spend", label: "Dépense", render: (l) => eur(l.spend), sort: (l) => l.spend },
          ...(seaOnly
            ? [
                {
                  key: "clicks",
                  label: "Clics",
                  render: (l: (typeof lps)[number]) => l.clicks,
                  sort: (l: (typeof lps)[number]) => l.clicks,
                },
                {
                  key: "impressions",
                  label: "Impressions",
                  render: (l: (typeof lps)[number]) => l.impressions,
                  sort: (l: (typeof lps)[number]) => l.impressions,
                },
                {
                  key: "ctr",
                  label: "CTR %",
                  render: (l: (typeof lps)[number]) => `${l.ctr.toFixed(2)} %`,
                  sort: (l: (typeof lps)[number]) => l.ctr,
                },
                {
                  key: "conversions",
                  label: "Conversions",
                  render: (l: (typeof lps)[number]) => l.conversions,
                  sort: (l: (typeof lps)[number]) => l.conversions ?? 0,
                },
                {
                  key: "cvr",
                  label: "CVR %",
                  render: (l: (typeof lps)[number]) => `${l.cvr.toFixed(2)} %`,
                  sort: (l: (typeof lps)[number]) => l.cvr,
                },
              ]
            : [
                {
                  key: "sea",
                  label: "Score SEA",
                  render: (l: (typeof lps)[number]) => <ScorePill v={l.scoreSEA} />,
                  sort: (l: (typeof lps)[number]) => l.scoreSEA,
                },
                {
                  key: "cro",
                  label: "Score CRO/UX",
                  render: (l: (typeof lps)[number]) => <ScorePill v={l.scoreCRO} quality />,
                  sort: (l: (typeof lps)[number]) => l.scoreCRO,
                },
                {
                  key: "shop",
                  label: "Score Shopify",
                  render: (l: (typeof lps)[number]) => <ScorePill v={l.scoreShopify} quality />,
                  sort: (l: (typeof lps)[number]) => l.scoreShopify,
                },
                {
                  key: "g",
                  label: "Score global",
                  render: (l: (typeof lps)[number]) => <ScorePill v={l.scoreGlobal} />,
                  sort: (l: (typeof lps)[number]) => l.scoreGlobal,
                },
              ]),
          { key: "priority", label: "Priorité", sort: (l) => l.priority },
        ]}
      />
    </>
  );
}
