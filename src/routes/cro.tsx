import { createFileRoute } from "@tanstack/react-router";
import { getCurrentLPs } from "@/lib/data";
import { PageHeader, Stat, Panel, DataTable, ScorePill } from "@/components/ui-kit";

export const Route = createFileRoute("/cro")({
  head: () => ({
    meta: [
      { title: "Audit CRO/UX — LP Radar" },
      {
        name: "description",
        content: "Structure, CTA, réassurance et vitesse Lighthouse de chaque landing page.",
      },
      { property: "og:title", content: "Audit CRO/UX — LP Radar" },
      {
        property: "og:description",
        content: "Structure, CTA, réassurance et vitesse Lighthouse de chaque landing page.",
      },
    ],
  }),
  component: CroPage,
});

function CroPage() {
  const lps = getCurrentLPs();
  if (lps.length > 0 && lps.every((lp) => lp.dataCoverage === "sea-only")) {
    return (
      <>
        <PageHeader kicker="Module 3 · Playwright + Lighthouse" title="Audit CRO/UX" />
        <Panel title="Connecteur requis">
          <p className="text-sm text-muted-foreground">
            Les données Google Ads ne contiennent pas les mesures CRO/UX. Aucun score de démo n’est
            affiché avec les données live.
          </p>
        </Panel>
      </>
    );
  }
  const pct = (f: (l: (typeof lps)[0]) => boolean) =>
    `${Math.round((lps.filter(f).length / lps.length) * 100)} %`;
  const avg = (f: (l: (typeof lps)[0]) => number) =>
    Math.round(lps.reduce((s, l) => s + f(l), 0) / lps.length);
  const issues = [
    { label: "Pas de CTA au-dessus de la ligne de flottaison", v: pct((l) => !l.ctaAboveFold) },
    { label: "Aucun bloc de réassurance", v: pct((l) => !l.reassurance) },
    { label: "Performance mobile < 50", v: pct((l) => l.lhPerf < 50) },
    { label: "Chargement > 4 s", v: pct((l) => l.loadTime > 4) },
    { label: "Scroll moyen < 40 %", v: pct((l) => l.scrollDepth < 40) },
  ];
  return (
    <>
      <PageHeader kicker="Module 3 · Playwright + Lighthouse" title="Audit CRO/UX" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Perf. mobile moy." value={avg((l) => l.lhPerf)} hint="Lighthouse" />
        <Stat label="Accessibilité moy." value={avg((l) => l.lhA11y)} />
        <Stat label="SEO moy." value={avg((l) => l.lhSEO)} />
        <Stat label="Score CRO/UX moy." value={avg((l) => l.scoreCRO)} hint="/100" />
      </div>
      <Panel title="Frictions détectées" className="mt-6">
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {issues.map((i) => (
            <li key={i.label} className="rounded-md border border-border p-4">
              <p className="font-display text-2xl font-semibold text-accent">{i.v}</p>
              <p className="mt-1 text-xs text-muted-foreground">{i.label}</p>
            </li>
          ))}
        </ul>
      </Panel>
      <h2 className="kicker mb-3 mt-10">Analyse page par page</h2>
      <DataTable
        rows={lps}
        csvName="cro-ux.csv"
        csvRow={(l) => ({
          LP: l.url,
          H1: l.h1,
          H2: l.h2Count,
          CTA: l.ctaCount,
          CTAFold: l.ctaAboveFold,
          Sections: l.sections,
          Reassurance: l.reassurance,
          Scroll: l.scrollDepth,
          Load: l.loadTime,
          Poids: l.assetWeight,
          Perf: l.lhPerf,
          ScoreCRO: l.scoreCRO,
        })}
        filters={[
          {
            label: "Réassurance",
            options: ["Oui", "Non"],
            get: (l) => (l.reassurance ? "Oui" : "Non"),
          },
        ]}
        cols={[
          {
            key: "url",
            label: "LP",
            render: (l) => <span className="font-mono text-xs">{l.url}</span>,
          },
          { key: "h1", label: "H1", render: (l) => <span className="text-xs">{l.h1}</span> },
          {
            key: "cta",
            label: "CTA",
            render: (l) => `${l.ctaCount}${l.ctaAboveFold ? " · fold ✓" : " · fold ✗"}`,
            sort: (l) => l.ctaCount,
          },
          { key: "sections", label: "Sections", sort: (l) => l.sections },
          {
            key: "scroll",
            label: "Scroll %",
            render: (l) => l.scrollDepth,
            sort: (l) => l.scrollDepth,
          },
          {
            key: "load",
            label: "Chargement",
            render: (l) => `${l.loadTime} s`,
            sort: (l) => l.loadTime,
          },
          {
            key: "w",
            label: "Poids",
            render: (l) => `${l.assetWeight} Mo`,
            sort: (l) => l.assetWeight,
          },
          {
            key: "perf",
            label: "Vitesse",
            render: (l) => <ScorePill v={l.lhPerf} quality />,
            sort: (l) => l.lhPerf,
          },
          {
            key: "s",
            label: "Score CRO/UX",
            render: (l) => <ScorePill v={l.scoreCRO} quality />,
            sort: (l) => l.scoreCRO,
          },
        ]}
      />
    </>
  );
}
