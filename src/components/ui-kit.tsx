import { useMemo, useState, type ReactNode } from "react";
import { Download, Search } from "lucide-react";
import { downloadCSV } from "@/lib/data";

export function PageHeader({ kicker, title, children }: { kicker: string; title: string; children?: ReactNode }) {
  return (
    <header className="mb-8 flex flex-wrap items-end justify-between gap-4 border-b border-border pb-6">
      <div>
        <p className="kicker">{kicker}</p>
        <h1 className="mt-2 font-display text-4xl font-semibold tracking-tight">{title}</h1>
      </div>
      <div className="flex gap-2">{children}</div>
    </header>
  );
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div className="panel p-5">
      <p className="kicker">{label}</p>
      <p className="mt-3 font-display text-3xl font-semibold">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

/** Default: high = urgent (red). `quality`: high = good (green). */
export function ScorePill({ v, quality }: { v: number; quality?: boolean }) {
  const x = quality ? 100 - v : v;
  const tone = x >= 60 ? "score-high" : x >= 45 ? "score-mid" : "score-low";
  return <span className={`score ${tone}`}>{v}</span>;
}

export function Panel({ title, children, className = "" }: { title?: string; children: ReactNode; className?: string }) {
  return (
    <section className={`panel p-5 ${className}`}>
      {title && <h2 className="kicker mb-4">{title}</h2>}
      {children}
    </section>
  );
}

export type Col<T> = { key: string; label: string; render?: (r: T) => ReactNode; sort?: (r: T) => number | string };

export function DataTable<T extends { id: number; url: string }>({
  rows,
  cols,
  csvName,
  csvRow,
  filters,
}: {
  rows: T[];
  cols: Col<T>[];
  csvName: string;
  csvRow: (r: T) => Record<string, unknown>;
  filters?: { label: string; options: string[]; get: (r: T) => string }[];
}) {
  const [q, setQ] = useState("");
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [dir, setDir] = useState<1 | -1>(-1);
  const [sel, setSel] = useState<Record<string, string>>({});
  const [limit, setLimit] = useState(25);

  const data = useMemo(() => {
    let d = rows.filter((r) => r.url.includes(q.toLowerCase()));
    filters?.forEach((f) => {
      if (sel[f.label]) d = d.filter((r) => f.get(r) === sel[f.label]);
    });
    const c = cols.find((c) => c.key === sortKey);
    if (c?.sort) d = [...d].sort((a, b) => (c.sort!(a) > c.sort!(b) ? dir : -dir));
    return d;
  }, [rows, q, sel, sortKey, dir, cols, filters]);

  return (
    <div className="panel overflow-hidden">
      <div className="flex flex-wrap items-center gap-3 border-b border-border p-4">
        <label className="flex flex-1 items-center gap-2 rounded-md border border-input bg-background px-3 py-2">
          <Search className="h-4 w-4 text-muted-foreground" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filtrer par URL…" className="w-full bg-transparent text-sm outline-none" />
        </label>
        {filters?.map((f) => (
          <select key={f.label} value={sel[f.label] ?? ""} onChange={(e) => setSel({ ...sel, [f.label]: e.target.value })} className="rounded-md border border-input bg-background px-3 py-2 text-sm">
            <option value="">{f.label} : tous</option>
            {f.options.map((o) => (
              <option key={o}>{o}</option>
            ))}
          </select>
        ))}
        <span className="font-mono text-xs text-muted-foreground">{data.length} LP</span>
        <button onClick={() => downloadCSV(csvName, data.map(csvRow))} className="btn-ghost">
          <Download className="h-4 w-4" /> CSV
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left">
              {cols.map((c) => (
                <th
                  key={c.key}
                  onClick={() => c.sort && (sortKey === c.key ? setDir(dir === 1 ? -1 : 1) : (setSortKey(c.key), setDir(-1)))}
                  className={`kicker whitespace-nowrap px-4 py-3 ${c.sort ? "cursor-pointer hover:text-foreground" : ""}`}
                >
                  {c.label}
                  {sortKey === c.key ? (dir === 1 ? " ↑" : " ↓") : ""}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.slice(0, limit).map((r) => (
              <tr key={r.id} className="border-b border-border/60 transition-colors hover:bg-muted/40">
                {cols.map((c) => (
                  <td key={c.key} className="whitespace-nowrap px-4 py-2.5">
                    {c.render ? c.render(r) : String((r as Record<string, unknown>)[c.key])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {data.length > limit && (
        <button onClick={() => setLimit(limit + 50)} className="w-full p-3 text-sm text-muted-foreground hover:text-foreground">
          Afficher plus ({data.length - limit} restantes)
        </button>
      )}
    </div>
  );
}
