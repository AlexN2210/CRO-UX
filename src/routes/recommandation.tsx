import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/ui-kit";
import { RecommendationContent } from "@/components/Recommendation";

export const Route = createFileRoute("/recommandation")({
  head: () => ({
    meta: [
      { title: "Recommandation stratégique — LP Radar" },
      { name: "description", content: "Approche recommandée, wireframe, périmètre, jours et budget estimés." },
      { property: "og:title", content: "Recommandation stratégique — LP Radar" },
      { property: "og:description", content: "Approche recommandée, wireframe, périmètre, jours et budget estimés." },
    ],
  }),
  component: () => (
    <>
      <PageHeader kicker="Module 6 · Stratégie" title="Recommandation" />
      <RecommendationContent />
    </>
  ),
});
