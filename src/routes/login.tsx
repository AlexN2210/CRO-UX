import { createFileRoute } from "@tanstack/react-router";
import { FormEvent, useEffect, useState } from "react";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [{ title: "Connexion — LP Radar" }, { name: "robots", content: "noindex, nofollow" }],
  }),
  component: LoginPage,
});

function LoginPage() {
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [setupRequired, setSetupRequired] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetch("/api/auth/status", { cache: "no-store" })
      .then((response) => response.json())
      .then((status: { setupRequired?: boolean; authenticated?: boolean }) => {
        setSetupRequired(Boolean(status.setupRequired));
        if (status.authenticated) window.location.replace("/");
      })
      .catch(() => setMessage("Le service de connexion est indisponible."));
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setMessage("");
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Connexion refusée.");
      window.location.replace("/");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Connexion impossible.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-[65vh] max-w-md items-center px-4 py-12">
      <section className="w-full border border-border bg-card p-6 shadow-sm">
        <p className="kicker">Espace privé</p>
        <h1 className="mt-2 text-2xl font-semibold">Connexion à LP Radar</h1>
        {setupRequired ? (
          <p className="mt-4 text-sm text-destructive">
            Accès fermé : configurez APP_ACCESS_PASSWORD (16 caractères minimum) et
            APP_SESSION_SECRET (32 caractères minimum) dans les secrets du serveur.
          </p>
        ) : (
          <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
            <label className="block space-y-2 text-sm">
              <span>Mot de passe d’accès</span>
              <input
                autoComplete="current-password"
                autoFocus
                required
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="w-full rounded-md border border-border bg-background px-3 py-2"
              />
            </label>
            {message && (
              <p role="alert" className="text-sm text-destructive">
                {message}
              </p>
            )}
            <button className="btn-primary w-full" type="submit" disabled={submitting}>
              {submitting ? "Connexion…" : "Se connecter"}
            </button>
          </form>
        )}
      </section>
    </main>
  );
}
