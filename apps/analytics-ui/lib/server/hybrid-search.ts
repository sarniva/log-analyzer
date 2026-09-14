import "server-only";
import { embedQuery } from "./embedder";

const QUICKWIT_URL = process.env.QUICKWIT_URL || "http://localhost:7280";
const QUICKWIT_INDEX = process.env.QUICKWIT_INDEX || "logs-v1";
const QDRANT_URL = process.env.QDRANT_URL || "http://localhost:6333";
const QDRANT_COLLECTION = process.env.QDRANT_COLLECTION || "tenant_logs";
const RRF_K = 60;

export type HybridSearchInput = {
  query: string;
  tenantId?: string;
  limit?: number;
};

export type HybridSearchResult = {
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

export type HybridSearchResponse = {
  query: string;
  tenantId?: string;
  limit: number;
  results: HybridSearchResult[];
  debug: {
    lexicalHits: number;
    semanticHits: number;
    hydrationHits: number;
    errors: string[];
  };
};

type QuickwitHit = {
  id: string;
  message: string | null;
  tenantId: string | null;
  level: string | null;
  timestamp: string | null;
  score?: number;
};

type QdrantHit = {
  id: string;
  tenantId: string | null;
  level: string | null;
  timestamp: string | null;
  score?: number;
};

function escapeQuickwitValue(value: string) {
  return value.replaceAll('"', '\\"');
}

function normalizeQuickwitHit(hit: unknown): QuickwitHit | null {
  if (!hit || typeof hit !== "object") {
    return null;
  }

  const record = hit as Record<string, unknown>;
  const source =
    record._source && typeof record._source === "object"
      ? (record._source as Record<string, unknown>)
      : record;

  const id =
    typeof source.id === "string"
      ? source.id
      : typeof record.id === "string"
        ? record.id
        : null;

  if (!id) {
    return null;
  }

  return {
    id,
    message: typeof source.message === "string" ? source.message : null,
    tenantId: typeof source.tenantId === "string" ? source.tenantId : null,
    level: typeof source.level === "string" ? source.level : null,
    timestamp: typeof source.timestamp === "string" ? source.timestamp : null,
    score: typeof record._score === "number" ? record._score : undefined,
  };
}

async function quickwitSearch(query: string, limit: number): Promise<QuickwitHit[]> {
  const response = await fetch(`${QUICKWIT_URL}/api/v1/${QUICKWIT_INDEX}/search`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query,
      max_hits: limit,
    }),
    cache: "no-store",
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Quickwit search failed: ${response.status} ${response.statusText} - ${body}`);
  }

  const data = (await response.json()) as { hits?: unknown[] };
  return (data.hits ?? []).map(normalizeQuickwitHit).filter((hit): hit is QuickwitHit => hit !== null);
}

async function qdrantSearch(vector: number[], tenantId: string | undefined, limit: number): Promise<QdrantHit[]> {
  const response = await fetch(`${QDRANT_URL}/collections/${QDRANT_COLLECTION}/points/search`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      vector,
      limit,
      with_payload: true,
      ...(tenantId
        ? {
            filter: {
              must: [
                {
                  key: "tenantId",
                  match: { value: tenantId },
                },
              ],
            },
          }
        : {}),
    }),
    cache: "no-store",
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Qdrant search failed: ${response.status} ${response.statusText} - ${body}`);
  }

  const data = (await response.json()) as {
    result?: Array<{
      id: string | number;
      score?: number;
      payload?: Record<string, unknown>;
    }>;
  };

  return (data.result ?? []).map((hit) => ({
    id: String(hit.id),
    tenantId: typeof hit.payload?.tenantId === "string" ? hit.payload.tenantId : null,
    level: typeof hit.payload?.level === "string" ? hit.payload.level : null,
    timestamp: typeof hit.payload?.timestamp === "string" ? hit.payload.timestamp : null,
    score: hit.score,
  }));
}

async function hydrateQuickwitByIds(ids: string[]) {
  if (ids.length === 0) {
    return new Map<string, QuickwitHit>();
  }

  const byIdQuery = ids.map((id) => `id:\"${escapeQuickwitValue(id)}\"`).join(" OR ");
  const hits = await quickwitSearch(byIdQuery, ids.length);
  return new Map(hits.map((hit) => [hit.id, hit]));
}

function buildLexicalQuery(rawQuery: string, tenantId?: string) {
  if (!tenantId) {
    return rawQuery;
  }

  return `tenantId:\"${escapeQuickwitValue(tenantId)}\" AND (${rawQuery})`;
}

export async function hybridSearch({ query, tenantId, limit = 10 }: HybridSearchInput): Promise<HybridSearchResponse> {
  const trimmedQuery = query.trim();

  if (!trimmedQuery) {
    throw new Error("Query is required.");
  }

  const safeLimit = Math.min(Math.max(limit, 1), 25);
  const vector = await embedQuery(trimmedQuery);
  const debugErrors: string[] = [];

  const [lexicalResult, semanticResult] = await Promise.allSettled([
    quickwitSearch(buildLexicalQuery(trimmedQuery, tenantId), safeLimit),
    qdrantSearch(vector, tenantId, safeLimit),
  ]);

  const lexicalHits = lexicalResult.status === "fulfilled" ? lexicalResult.value : [];
  const semanticHits = semanticResult.status === "fulfilled" ? semanticResult.value : [];

  if (lexicalResult.status === "rejected") {
    debugErrors.push(lexicalResult.reason instanceof Error ? lexicalResult.reason.message : "Quickwit search failed.");
  }

  if (semanticResult.status === "rejected") {
    debugErrors.push(semanticResult.reason instanceof Error ? semanticResult.reason.message : "Qdrant search failed.");
  }

  const semanticIdsNeedingHydration = semanticHits
    .map((hit) => hit.id)
    .filter((id) => !lexicalHits.some((lexicalHit) => lexicalHit.id === id));

  let hydrationHits = new Map<string, QuickwitHit>();

  if (semanticIdsNeedingHydration.length > 0) {
    try {
      hydrationHits = await hydrateQuickwitByIds(semanticIdsNeedingHydration);
    } catch (error) {
      debugErrors.push(error instanceof Error ? error.message : "Quickwit hydration failed.");
    }
  }

  const fused = new Map<string, HybridSearchResult>();

  lexicalHits.forEach((hit, index) => {
    const rank = index + 1;
    const current = fused.get(hit.id) ?? {
      id: hit.id,
      message: hit.message,
      tenantId: hit.tenantId,
      level: hit.level,
      timestamp: hit.timestamp,
      fusedScore: 0,
      matchedBy: [],
    };

    current.message = current.message ?? hit.message;
    current.tenantId = current.tenantId ?? hit.tenantId;
    current.level = current.level ?? hit.level;
    current.timestamp = current.timestamp ?? hit.timestamp;
    current.lexicalRank = rank;
    current.lexicalScore = hit.score;
    current.fusedScore += 1 / (RRF_K + rank);

    if (!current.matchedBy.includes("lexical")) {
      current.matchedBy.push("lexical");
    }

    fused.set(hit.id, current);
  });

  semanticHits.forEach((hit, index) => {
    const rank = index + 1;
    const hydration = hydrationHits.get(hit.id);
    const current = fused.get(hit.id) ?? {
      id: hit.id,
      message: hydration?.message ?? null,
      tenantId: hit.tenantId ?? hydration?.tenantId ?? null,
      level: hit.level ?? hydration?.level ?? null,
      timestamp: hit.timestamp ?? hydration?.timestamp ?? null,
      fusedScore: 0,
      matchedBy: [],
    };

    current.message = current.message ?? hydration?.message ?? null;
    current.tenantId = current.tenantId ?? hit.tenantId ?? hydration?.tenantId ?? null;
    current.level = current.level ?? hit.level ?? hydration?.level ?? null;
    current.timestamp = current.timestamp ?? hit.timestamp ?? hydration?.timestamp ?? null;
    current.semanticRank = rank;
    current.semanticScore = hit.score;
    current.fusedScore += 1 / (RRF_K + rank);

    if (!current.matchedBy.includes("semantic")) {
      current.matchedBy.push("semantic");
    }

    fused.set(hit.id, current);
  });

  const results = [...fused.values()]
    .sort((a, b) => b.fusedScore - a.fusedScore)
    .slice(0, safeLimit);

  return {
    query: trimmedQuery,
    tenantId,
    limit: safeLimit,
    results,
    debug: {
      lexicalHits: lexicalHits.length,
      semanticHits: semanticHits.length,
      hydrationHits: hydrationHits.size,
      errors: debugErrors,
    },
  };
}
