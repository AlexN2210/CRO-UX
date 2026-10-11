import { createFileRoute } from "@tanstack/react-router";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip } from "recharts";
import { getLPs, eur } from "@/lib/data";
import { PageHeader, Stat, Panel, DataTable, ScorePill } from "@/components/ui-kit";

export const Route = createFileRoute("/sea")({
  head: () => ({
    meta: [
      { title: "Analyse SEA — LP Radar" },
      { name: "description", content: "Dépenses, Quality Score, expérience LP et conversion par landing page Google Ads." },
      { property: "og:title", content: "Analyse SEA — LP Radar" },
      { property: "og:description", content: "Dépenses, Quality Score, expérience LP et conversion par landing page." },
    ],
  }),
  component: SeaPage,
});

function SeaPage() {
  const lps = getLPs();
  const spend = lps.reduce((s, l) => s + l.spend, 0);
  const avg = (f: (l: (typeof lps)[0]) => number) => (lps.reduce((s, l) => s + f(l), 0) / lps.length).toFixed(1);
  const qsDist = Array.from({ length: 10 }, (_, i) => ({ qs: i + 1, n: lps.filter((l) => l.qs === i + 1).length }));
  const camps = Object.entries(lps.reduce<Record<string, number>>((a, l) => ((a[l.campaign] = (a[l.campaign] ?? 0) + l.spend), a), {})).map(([c, s]) => ({ c, s }));
  const tip = { contentStyle: { background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 } };

  return (
    <>
      <PageHeader kicker="Module 2 · Google Ads" title="Analyse SEA" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Dépense" value={eur(spend)} />
        <Stat label="QS moyen" value={avg((l) => l.qs)} hint="/10" />
        <Stat label="CTR moyen" value={`${avg((l) => l.ctr)} %`} />
        <Stat label="CVR moyen" value={`${avg((l) => l.cvr)} %`} />
      </div>
      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Panel title="Distribution du Quality Score">
          <div className="h-56"><ResponsiveContainer><BarChart data={qsDist}><XAxis dataKey="qs" stroke="var(--muted-foreground)" fontSize={11} /><YAxis stroke="var(--muted-foreground)" fontSize={11} /><Tooltip {...tip} cursor={{ fill: "var(--muted)" }} /><Bar dataKey="n" name="LP" fill="var(--chart-1)" radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer></div>
        </Panel>
        <Panel title="Dépense par campagne">
          <div className="h-56"><ResponsiveContainer><BarChart data={camps} layout="vertical"><XAxis type="number" stroke="var(--muted-foreground)" fontSize={11} /><YAxis type="category" dataKey="c" width={150} stroke="var(--muted-foreground)" fontSize={11} /><Tooltip {...tip} cursor={{ fill: "var(--muted)" }} /><Bar dataKey="s" name="€" fill="var(--chart-2)" radius={[0, 4, 4, 0]} /></BarChart></ResponsiveContainer></div>
        </Panel>
      </div>
      <h2 className="kicker mb-3 mt-10">Landing pages Search</h2>
      <DataTable
        rows={lps}
        csvName="sea.csv"
        csvRow={(l) => ({ LP: l.url, Campagne: l.campaign, Spend: l.spend, QS: l.qs, LPExp: l.lpExp, CVR: l.cvr, CTR: l.ctr, CPC: l.cpc, Keywords: l.keywords, ScoreSEA: l.scoreSEA })}
        filters={[
          { label: "Campagne", options: [...new Set(lps.map((l) => l.campaign))], get: (l) => l.campaign },
          { label: "LP Exp", options: ["Au-dessus", "Moyenne", "En dessous"], get: (l) => l.lpExp },
        ]}
        cols={[
          { key: "url", label: "LP", render: (l) => <span className="font-mono text-xs">{l.url}</span> },
          { key: "spend", label: "Spend", render: (l) => eur(l.spend), sort: (l) => l.spend },
          { key: "qs", label: "QS", sort: (l) => l.qs },
          { key: "lpExp", label: "LP Exp", sort: (l) => l.lpExp },
          { key: "cvr", label: "CVR %", sort: (l) => l.cvr },
          { key: "ctr", label: "CTR %", sort: (l) => l.ctr },
          { key: "cpc", label: "CPC €", sort: (l) => l.cpc },
          { key: "kw", label: "Mots-clés", render: (l) => <span className="text-xs text-muted-foreground">{l.keywords.join(", ")}</span> },
          { key: "s", label: "Score SEA", render: (l) => <ScorePill v={l.scoreSEA} />, sort: (l) => l.scoreSEA },
        ]}
      />
    </>
  );
}
