import { createFileRoute, Link } from "@tanstack/react-router";
import { Printer } from "lucide-react";
import { getLPs, estimate, eur } from "@/lib/data";
import { PageHeader, Panel, ScorePill } from "@/components/ui-kit";
import { RecommendationContent } from "@/components/Recommendation";

export const Route = createFileRoute("/rapport")({
  head: () => ({
    meta: [
      { title: "Rapport final — LP Radar" },
      { name: "description", content: "Rapport complet SEA, CRO/UX, Shopify, recommandation, planning et budget, exportable en PDF." },
      { property: "og:title", content: "Rapport final — LP Radar" },
      { property: "og:description", content: "Rapport complet exportable en PDF." },
    ],
  }),
  component: Rapport,
});

function Rapport() {
  const lps = getLPs();
  const e = estimate(lps);
  const spend = lps.reduce((s, l) => s + l.spend, 0);
  const top = [...lps].sort((a, b) => b.scoreGlobal - a.scoreGlobal).slice(0, 10);
  const avg = (f: (l: (typeof lps)[0]) => number) => Math.round(lps.reduce((s, l) => s + f(l), 0) / lps.length);
  const weeks = Math.ceil(e.days / 5);
  return (
    <>
      <PageHeader kicker="Module 7 · Export" title="Rapport final">
        <div className="flex gap-2">
          <Link to="/devis" className="btn-ghost">Voir le devis</Link>
          <button onClick={() => window.print()} className="btn-primary no-print"><Printer className="h-4 w-4" /> Exporter en PDF</button>
        </div>
      </PageHeader>
      <div className="space-y-6">
        <Panel title="1 · Synthèse">
          <p className="text-sm leading-relaxed">
            {lps.length} landing pages analysées pour {eur(spend)} de dépense Search. QS moyen {(lps.reduce((s, l) => s + l.qs, 0) / lps.length).toFixed(1)}/10,
            score CRO/UX moyen {avg((l) => l.scoreCRO)}/100, vitesse mobile moyenne {avg((l) => l.lhPerf)}/100.
            {" "}{e.p1.length} LP sont classées P1 et concentrent {Math.round((e.p1.reduce((s, l) => s + l.spend, 0) / spend) * 100)} % du budget.
          </p>
        </Panel>
        <Panel title="2 · Top 10 des LP à optimiser">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-border text-left"><th className="kicker py-2">LP</th><th className="kicker">Dépense</th><th className="kicker">SEA</th><th className="kicker">CRO/UX</th><th className="kicker">Template</th><th className="kicker">Global</th></tr></thead>
            <tbody>
              {top.map((l) => (
                <tr key={l.id} className="border-b border-border/60">
                  <td className="py-2 font-mono text-xs">{l.url}</td><td>{eur(l.spend)}</td><td><ScorePill v={l.scoreSEA} /></td><td><ScorePill v={l.scoreCRO} quality /></td><td className="font-mono text-xs">{l.template}</td><td><ScorePill v={l.scoreGlobal} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
        <h2 className="kicker pt-2">3 · Recommandation & périmètre</h2>
        <RecommendationContent />
        <Panel title="4 · Planning">
          <ol className="grid gap-3 sm:grid-cols-4">
            {[
              { w: "S1", t: "Audit & validation des wireframes" },
              { w: `S2–S${Math.max(2, weeks - 2)}`, t: "Refonte des templates partagés" },
              { w: `S${weeks - 1}`, t: "LP individuelles prioritaires" },
              { w: `S${weeks}`, t: "QA, mise en ligne, A/B tests" },
            ].map((p) => (
              <li key={p.t} className="rounded-md border border-border p-4"><p className="font-mono text-xs text-primary">{p.w}</p><p className="mt-1 text-sm">{p.t}</p></li>
            ))}
          </ol>
          <p className="mt-4 text-sm">Total : <strong>{e.days} jours</strong> · <strong>{eur(e.budget)} HT</strong></p>
        </Panel>
      </div>
    </>
  );
}
