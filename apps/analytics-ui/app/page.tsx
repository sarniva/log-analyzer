"use client";

import { useMemo, useState } from "react";

type SearchResult = {
  id: string;
  message: string | null;
  tenantId: string | null;
  level: string | null;
  timestamp: string | null;
  fusedScore: number;
  lexicalRank?: number;
  semanticRank?: number;
  lexicalScore?: number;
  semanticScore?: number;
  matchedBy: Array<"lexical" | "semantic">;
};

type SearchResponse = {
  query: string;
  tenantId?: string;
  limit: number;
  results: SearchResult[];
  debug: {
    lexicalHits: number;
    semanticHits: number;
    hydrationHits: number;
    errors: string[];
  };
};

const exampleQueries = [
  "Stripe timeout",
  "OAuth authentication success",
  "502 bad gateway",
  "out of memory process killed",
];

export default function Home() {
  const [query, setQuery] = useState(exampleQueries[0]);
  const [tenantId, setTenantId] = useState("");
  const [limit, setLimit] = useState(10);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<SearchResponse | null>(null);

  const hasResults = (data?.results.length ?? 0) > 0;
  const sourceMix = useMemo(() => {
    if (!data) return null;

    return {
      lexicalOnly: data.results.filter((result) => result.matchedBy.length === 1 && result.matchedBy[0] === "lexical").length,
      semanticOnly: data.results.filter((result) => result.matchedBy.length === 1 && result.matchedBy[0] === "semantic").length,
      fused: data.results.filter((result) => result.matchedBy.length === 2).length,
    };
  }, [data]);

  async function runSearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/hybrid-search", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query,
          tenantId: tenantId.trim() || undefined,
          limit,
        }),
      });

      const payload = (await response.json()) as SearchResponse | { error: string };

      if (!response.ok) {
        throw new Error("error" in payload ? payload.error : "Hybrid search failed.");
      }

      setData(payload as SearchResponse);
    } catch (searchError) {
      setData(null);
      setError(searchError instanceof Error ? searchError.message : "Hybrid search failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <main className="mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-8 px-6 py-10 lg:px-10">
        <section className="space-y-4">
          <div className="inline-flex items-center rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-medium uppercase tracking-[0.2em] text-emerald-300">
            LogQL • Hybrid Search Console
          </div>
          <div className="space-y-3">
            <h1 className="text-4xl font-semibold tracking-tight text-white sm:text-5xl">
              Search logs with lexical + semantic ranking.
            </h1>
            <p className="max-w-3xl text-sm leading-7 text-zinc-400 sm:text-base">
              This first analytics UI fans a query out to Quickwit and Qdrant, embeds the query locally with
              <code className="mx-1 rounded bg-zinc-900 px-1.5 py-0.5 font-mono text-xs text-zinc-200">all-MiniLM-L6-v2</code>
              and merges the result sets with Reciprocal Rank Fusion.
            </p>
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
          <form onSubmit={runSearch} className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-6 shadow-2xl shadow-black/20">
            <div className="space-y-5">
              <div>
                <label className="mb-2 block text-sm font-medium text-zinc-200">Search query</label>
                <textarea
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  rows={4}
                  placeholder="Find payment failures, auth anomalies, infra regressions..."
                  className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-sm text-zinc-100 outline-none ring-0 transition focus:border-emerald-400"
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-2 block text-sm font-medium text-zinc-200">Tenant ID</label>
                  <input
                    value={tenantId}
                    onChange={(event) => setTenantId(event.target.value)}
                    placeholder="Optional tenant scope"
                    className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-sm text-zinc-100 outline-none transition focus:border-emerald-400"
                  />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-zinc-200">Limit</label>
                  <input
                    type="number"
                    min={1}
                    max={25}
                    value={limit}
                    onChange={(event) => setLimit(Number(event.target.value) || 10)}
                    className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-sm text-zinc-100 outline-none transition focus:border-emerald-400"
                  />
                </div>
              </div>

              <div>
                <p className="mb-2 text-xs font-medium uppercase tracking-[0.18em] text-zinc-500">Example queries</p>
                <div className="flex flex-wrap gap-2">
                  {exampleQueries.map((example) => (
                    <button
                      key={example}
                      type="button"
                      onClick={() => setQuery(example)}
                      className="rounded-full border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 transition hover:border-emerald-400 hover:text-emerald-200"
                    >
                      {example}
                    </button>
                  ))}
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="inline-flex w-full items-center justify-center rounded-xl bg-emerald-400 px-4 py-3 text-sm font-semibold text-zinc-950 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:bg-emerald-400/60"
              >
                {loading ? "Searching…" : "Run hybrid search"}
              </button>
            </div>
          </form>

          <section className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-6">
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-white">Results</h2>
                <p className="text-sm text-zinc-400">Ranked via Reciprocal Rank Fusion across lexical and semantic search.</p>
              </div>
              {data ? (
                <div className="flex flex-wrap gap-2 text-xs text-zinc-300">
                  <span className="rounded-full border border-zinc-700 px-3 py-1">Quickwit: {data.debug.lexicalHits}</span>
                  <span className="rounded-full border border-zinc-700 px-3 py-1">Qdrant: {data.debug.semanticHits}</span>
                  <span className="rounded-full border border-zinc-700 px-3 py-1">Hydrated: {data.debug.hydrationHits}</span>
                </div>
              ) : null}
            </div>

            {error ? (
              <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-200">{error}</div>
            ) : null}

            {!data && !error ? (
              <div className="rounded-xl border border-dashed border-zinc-700 p-8 text-center text-sm text-zinc-500">
                Run your first query to inspect merged Quickwit and Qdrant results.
              </div>
            ) : null}

            {data && !hasResults ? (
              <div className="space-y-4 rounded-xl border border-zinc-800 bg-zinc-950/50 p-5 text-sm text-zinc-400">
                <p>No hits returned for this query.</p>
                {data.debug.errors.length > 0 ? (
                  <ul className="list-disc space-y-1 pl-5 text-red-300">
                    {data.debug.errors.map((debugError) => (
                      <li key={debugError}>{debugError}</li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : null}

            {data && hasResults ? (
              <div className="space-y-5">
                {sourceMix ? (
                  <div className="grid gap-3 sm:grid-cols-3">
                    <MetricCard label="Fused hits" value={sourceMix.fused} accent="emerald" />
                    <MetricCard label="Lexical only" value={sourceMix.lexicalOnly} accent="blue" />
                    <MetricCard label="Semantic only" value={sourceMix.semanticOnly} accent="violet" />
                  </div>
                ) : null}

                {data.debug.errors.length > 0 ? (
                  <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-100">
                    <p className="font-medium">Partial search errors</p>
                    <ul className="mt-2 list-disc space-y-1 pl-5">
                      {data.debug.errors.map((debugError) => (
                        <li key={debugError}>{debugError}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                <div className="space-y-4">
                  {data.results.map((result, index) => (
                    <article key={result.id} className="rounded-2xl border border-zinc-800 bg-zinc-950/60 p-5">
                      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                        <div className="space-y-2">
                          <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-400">
                            <span className="rounded-full border border-zinc-700 px-2.5 py-1">#{index + 1}</span>
                            {result.level ? <span className="rounded-full border border-zinc-700 px-2.5 py-1">{result.level}</span> : null}
                            {result.timestamp ? <span className="rounded-full border border-zinc-700 px-2.5 py-1">{new Date(result.timestamp).toLocaleString()}</span> : null}
                            <span className="rounded-full border border-zinc-700 px-2.5 py-1">{result.matchedBy.join(" + ")}</span>
                          </div>
                          <h3 className="font-mono text-xs text-zinc-500">{result.id}</h3>
                        </div>
                        <div className="text-right">
                          <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">Fused score</p>
                          <p className="text-lg font-semibold text-emerald-300">{result.fusedScore.toFixed(4)}</p>
                        </div>
                      </div>

                      <p className="text-sm leading-7 text-zinc-200">{result.message ?? "Semantic hit returned without a hydrated raw message."}</p>

                      <dl className="mt-4 grid gap-3 text-xs text-zinc-400 sm:grid-cols-2 xl:grid-cols-4">
                        <MetaItem label="Tenant" value={result.tenantId ?? "—"} />
                        <MetaItem label="Lexical rank" value={result.lexicalRank ? String(result.lexicalRank) : "—"} />
                        <MetaItem label="Semantic rank" value={result.semanticRank ? String(result.semanticRank) : "—"} />
                        <MetaItem label="Source scores" value={formatSourceScores(result)} />
                      </dl>
                    </article>
                  ))}
                </div>
              </div>
            ) : null}
          </section>
        </section>
      </main>
    </div>
  );
}

function MetricCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent: "emerald" | "blue" | "violet";
}) {
  const accentClass = {
    emerald: "border-emerald-500/30 bg-emerald-500/10 text-emerald-200",
    blue: "border-blue-500/30 bg-blue-500/10 text-blue-200",
    violet: "border-violet-500/30 bg-violet-500/10 text-violet-200",
  }[accent];

  return (
    <div className={`rounded-xl border p-4 ${accentClass}`}>
      <p className="text-xs uppercase tracking-[0.18em]">{label}</p>
      <p className="mt-2 text-2xl font-semibold">{value}</p>
    </div>
  );
}

function MetaItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-3">
      <dt className="mb-1 text-[11px] uppercase tracking-[0.16em] text-zinc-500">{label}</dt>
      <dd className="break-all text-zinc-300">{value}</dd>
    </div>
  );
}

function formatSourceScores(result: SearchResult) {
  const lexical = result.lexicalScore !== undefined ? `L:${result.lexicalScore.toFixed(4)}` : null;
  const semantic = result.semanticScore !== undefined ? `S:${result.semanticScore.toFixed(4)}` : null;
  return [lexical, semantic].filter(Boolean).join(" • ") || "—";
}
