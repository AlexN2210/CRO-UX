import { createFileRoute } from "@tanstack/react-router";
import { Mail, Printer } from "lucide-react";
import { getCurrentLPs, estimate, eur } from "@/lib/data";
import { PageHeader, Panel } from "@/components/ui-kit";

export const Route = createFileRoute("/devis")({
  head: () => ({
    meta: [
      { title: "Devis d’implémentation — LP Radar" },
      {
        name: "description",
        content:
          "Devis de la phase 2, périmètre, calendrier et livrables pour l’optimisation des landing pages.",
      },
      { property: "og:title", content: "Devis d’implémentation — LP Radar" },
      {
        property: "og:description",
        content: "Phase 2 : devis, périmètre et planning d’implémentation.",
      },
    ],
  }),
  component: DevisPage,
});

function DevisPage() {
  const lps = getCurrentLPs();
  if (lps.length > 0 && lps.every((lp) => lp.dataCoverage === "sea-only")) {
    return (
      <>
        <PageHeader kicker="Module 7 · Devis" title="Devis d’implémentation" />
        <Panel>
          <p className="text-sm text-muted-foreground">
            Le devis sera calculable après les audits CRO/UX et Shopify. Les données Google Ads
            seules ne suffisent pas à chiffrer l’implémentation.
          </p>
        </Panel>
      </>
    );
  }
  const e = estimate(lps);
  const weekCount = Math.ceil(e.days / 5);
  const mailto = `mailto:contact@agency.example?subject=${encodeURIComponent("Devis d'implémentation LP Radar")}&body=${encodeURIComponent(
    [
      "Bonjour,",
      "",
      "Voici le devis de la phase 2 pour l’optimisation des landing pages.",
      "",
      `Approche recommandée : ${e.approach}`,
      `Périmètre : ${e.p1.length} LP prioritaires / ${e.sharedTemplates.length} templates partagés / ${e.legacy.length} LP legacy`,
      `Durée estimée : ${e.days} jours (${weekCount} semaines)`,
      `Budget estimé : ${eur(e.budget)} HT`,
      "",
      "Livrables attendus :",
      "- Audit SEA/CRO/Shopify finalisé",
      "- Wireframes et recommandations UX",
      "- Templates partagés refondus",
      "- Optimisation des LP prioritaires",
      "- QA, A/B tests et mise en ligne",
      "",
      "Merci de confirmer le périmètre pour lancer le devis de mise en œuvre.",
    ].join("\n"),
  )}`;

  const deliverables = [
    "Audit SEA : notion de budget, QS, LP Exp, priorisation des pages",
    "Audit CRO/UX : structure, CTA, parcours mobile, points de friction",
    "Analyse Shopify : template, sections réutilisables, potentiel de scalabilité",
    "Wireframes et recommandations UX orientés conversion",
    "Implémentation, QA, A/B tests et mise en ligne",
  ];

  return (
    <>
      <PageHeader kicker="Module 7 · Devis" title="Devis d’implémentation">
        <div className="flex gap-2">
          <button onClick={() => window.print()} className="btn-ghost no-print">
            <Printer className="h-4 w-4" /> Imprimer
          </button>
          <a href={mailto} className="btn-primary">
            <Mail className="h-4 w-4" /> Envoyer le devis
          </a>
        </div>
      </PageHeader>

      <div className="space-y-6">
        <Panel>
          <p className="kicker">Approche recommandée</p>
          <p className="mt-2 font-display text-4xl font-semibold text-primary">{e.approach}</p>
          <div className="mt-6 grid gap-4 md:grid-cols-4">
            <div>
              <p className="kicker">Périmètre</p>
              <p className="font-display text-3xl font-semibold">{e.p1.length}</p>
              <p className="text-xs text-muted-foreground">LP P1</p>
            </div>
            <div>
              <p className="kicker">Jours</p>
              <p className="font-display text-3xl font-semibold">{e.days}</p>
              <p className="text-xs text-muted-foreground">{weekCount} semaines</p>
            </div>
            <div>
              <p className="kicker">Budget</p>
              <p className="font-display text-3xl font-semibold">{eur(e.budget)}</p>
              <p className="text-xs text-muted-foreground">HT</p>
            </div>
            <div>
              <p className="kicker">TJM</p>
              <p className="font-display text-3xl font-semibold">{eur(e.tjm)}</p>
              <p className="text-xs text-muted-foreground">journalier</p>
            </div>
          </div>
        </Panel>

        <div className="grid gap-6 lg:grid-cols-2">
          <Panel title="Périmètre exact">
            <ul className="space-y-3 text-sm">
              <li className="rounded-md border border-dashed border-border p-3">
                <strong>{e.p1.length}</strong> LP prioritaires à auditer et optimiser.
              </li>
              <li className="rounded-md border border-dashed border-border p-3">
                <strong>{e.sharedTemplates.length}</strong> templates partagés à refondre pour un
                impact scalable.
              </li>
              <li className="rounded-md border border-dashed border-border p-3">
                <strong>{e.legacy.length}</strong> LP legacy à traiter individuellement ou migrer.
              </li>
              <li className="rounded-md border border-dashed border-border p-3">
                <strong>{weekCount}</strong> semaines de mise en œuvre, QA et A/B testing.
              </li>
            </ul>
          </Panel>

          <Panel title="Livrables attendus">
            <ol className="space-y-2 text-sm">
              {deliverables.map((d, i) => (
                <li key={d} className="flex gap-3 rounded-md border border-border p-3">
                  <span className="font-mono text-xs text-primary">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span>{d}</span>
                </li>
              ))}
            </ol>
          </Panel>
        </div>

        <Panel title="Planning de mise en œuvre">
          <ol className="grid gap-3 sm:grid-cols-4">
            {[
              { w: "S1", t: "Audit SEA et validation des priorités" },
              { w: `S2–S${Math.max(2, weekCount - 2)}`, t: "Refonte des templates partagés" },
              { w: `S${weekCount - 1}`, t: "Optimisation des LP prioritaires" },
              { w: `S${weekCount}`, t: "QA, mise en ligne, A/B tests" },
            ].map((step) => (
              <li key={step.w} className="rounded-md border border-border p-4">
                <p className="font-mono text-xs text-primary">{step.w}</p>
                <p className="mt-1 text-sm">{step.t}</p>
              </li>
            ))}
          </ol>
          <p className="mt-4 text-sm text-muted-foreground">
            Cette proposition est alignée avec le workflow SEA → CRO/UX → Shopify → recommandation →
            devis, et déclenche la phase 2 de mise en œuvre.
          </p>
        </Panel>
      </div>
    </>
  );
}
