import { getLPs, estimate, eur } from "@/lib/data";
import { Panel } from "@/components/ui-kit";

const WIREFRAME = [
  { b: "Hero : H1 = requête principale + CTA visible", tag: "à modifier" },
  { b: "Barre de réassurance (livraison, retours, avis)", tag: "à ajouter" },
  { b: "Grille produits pilotée par metafield", tag: "dynamique" },
  { b: "Bloc bénéfices / comparatif", tag: "à ajouter" },
  { b: "Avis clients", tag: "dynamique" },
  { b: "FAQ alimentée par metafields", tag: "dynamique" },
  { b: "CTA final collant mobile", tag: "à ajouter" },
];

export function RecommendationContent() {
  const lps = getLPs();
  const e = estimate(lps);
  const tplRows = e.sharedTemplates.map((t) => ({ t, n: e.counts[t], p1: lps.filter((l) => l.template === t && l.priority === "P1").length }));
  return (
    <div className="space-y-6">
      <Panel>
        <p className="kicker">Approche recommandée</p>
        <p className="mt-2 font-display text-4xl font-semibold text-primary">{e.approach}</p>
        <p className="mt-3 max-w-3xl text-sm text-muted-foreground">
          {e.sharedTemplates.length} templates partagés couvrent {tplRows.reduce((s, r) => s + r.n, 0)} LP : les optimiser en une fois propage les gains à grande échelle.
          Les {e.legacy.length} LP legacy demandent un traitement individuel ou une migration.
        </p>
        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          <div><p className="kicker">Jours estimés</p><p className="font-display text-3xl font-semibold">{e.days} j</p></div>
          <div><p className="kicker">Budget estimé</p><p className="font-display text-3xl font-semibold">{eur(e.budget)}</p><p className="text-xs text-muted-foreground">TJM {eur(e.tjm)}</p></div>
          <div><p className="kicker">LP P1 couvertes</p><p className="font-display text-3xl font-semibold">{e.p1.length}</p></div>
        </div>
      </Panel>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Wireframe recommandé">
          <ol className="space-y-2">
            {WIREFRAME.map((w, i) => (
              <li key={w.b} className="flex items-center justify-between gap-3 rounded-md border border-dashed border-border p-3 text-sm">
                <span><span className="mr-3 font-mono text-xs text-muted-foreground">{String(i + 1).padStart(2, "0")}</span>{w.b}</span>
                <span className={`score ${w.tag === "à ajouter" ? "score-low" : w.tag === "dynamique" ? "score-mid" : "score-high"}`}>{w.tag}</span>
              </li>
            ))}
          </ol>
        </Panel>
        <Panel title="Périmètre — templates à refondre">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-border text-left"><th className="kicker py-2">Template</th><th className="kicker">LP</th><th className="kicker">P1</th><th className="kicker">Jours</th></tr></thead>
            <tbody>
              {tplRows.map((r) => (
                <tr key={r.t} className="border-b border-border/60"><td className="py-2 font-mono text-xs">{r.t}</td><td>{r.n}</td><td>{r.p1}</td><td>6</td></tr>
              ))}
              <tr><td className="py-2 font-mono text-xs">LP individuelles</td><td>—</td><td>—</td><td>{e.days - 5 - tplRows.length * 6}</td></tr>
              <tr><td className="py-2 font-mono text-xs">Audit, QA, A/B tests</td><td>—</td><td>—</td><td>5</td></tr>
            </tbody>
          </table>
          <p className="mt-4 text-xs text-muted-foreground">Sections à rendre dynamiques : product-grid, faq, testimonials. CTA recommandés : « Voir la sélection », « Trouver ma taille ».</p>
        </Panel>
      </div>
    </div>
  );
}
