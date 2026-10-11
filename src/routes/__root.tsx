import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Outlet, Link, createRootRouteWithContext, useRouter, HeadContent, Scripts, type ErrorComponentProps } from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";
import { LayoutDashboard, Megaphone, MousePointerClick, ShoppingBag, Lightbulb, FileText } from "lucide-react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center px-4 text-center">
      <div>
        <h1 className="font-display text-7xl font-bold">404</h1>
        <p className="mt-2 text-sm text-muted-foreground">Page introuvable.</p>
        <Link to="/" className="btn-primary mt-6">Retour au dashboard</Link>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: ErrorComponentProps) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);
  return (
    <div className="flex min-h-screen items-center justify-center px-4 text-center">
      <div>
        <h1 className="text-xl font-semibold">Cette page n'a pas pu se charger</h1>
        <button onClick={() => { router.invalidate(); reset(); }} className="btn-primary mt-6">Réessayer</button>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "LP Radar — Audit SEA × CRO × Shopify" },
      { name: "description", content: "Croisez Google Ads, CRO/UX et Shopify pour prioriser vos landing pages." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", href: "/favicon.ico", type: "image/x-icon" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:wght@400;500;600&family=Space+Grotesk:wght@500;600;700&display=swap" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="fr">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

const NAV = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/sea", label: "Analyse SEA", icon: Megaphone },
  { to: "/cro", label: "Audit CRO/UX", icon: MousePointerClick },
  { to: "/shopify", label: "Analyse Shopify", icon: ShoppingBag },
  { to: "/recommandation", label: "Recommandation", icon: Lightbulb },
  { to: "/rapport", label: "Rapport final", icon: FileText },
  { to: "/devis", label: "Devis", icon: FileText },
] as const;

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  return (
    <QueryClientProvider client={queryClient}>
      <div className="flex min-h-screen">
        <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar p-4 md:flex">
          <div className="mb-8 px-3">
            <p className="font-display text-xl font-bold">LP<span className="text-primary">·</span>Radar</p>
            <p className="kicker mt-1">184 landing pages</p>
          </div>
          <nav className="flex flex-col gap-1">
            {NAV.map(({ to, label, icon: Icon }) => (
              <Link key={to} to={to} className="nav-link" activeProps={{ className: "nav-active" }} activeOptions={{ exact: true }}>
                <Icon className="h-4 w-4" /> {label}
              </Link>
            ))}
          </nav>
          <div className="mt-auto rounded-md border border-dashed border-border p-3 text-xs text-muted-foreground">
            Données de démonstration. Google Ads & Shopify à connecter.
          </div>
        </aside>
        <main className="min-w-0 flex-1 p-6 md:p-10">
          <nav className="no-print mb-6 flex gap-2 overflow-x-auto md:hidden">
            {NAV.map(({ to, label }) => (
              <Link key={to} to={to} className="nav-link whitespace-nowrap" activeProps={{ className: "nav-active" }} activeOptions={{ exact: true }}>{label}</Link>
            ))}
          </nav>
          <Outlet />
        </main>
      </div>
    </QueryClientProvider>
  );
}
