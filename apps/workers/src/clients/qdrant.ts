import { QdrantClient } from "@qdrant/js-client-rest";

const COLLECTION_NAME = "tenant_logs";
const VECTOR_SIZE = 384;

export const qdrantClient = new QdrantClient({
  url: process.env.QDRANT_URL || "http://localhost:6333",
});

export async function ensureQdrantCollection() {
  const collections = await qdrantClient.getCollections();
  const exists = collections.collections.some(
    (collection) => collection.name === COLLECTION_NAME,
  );

  if (!exists) {
    await qdrantClient.createCollection(COLLECTION_NAME, {
      vectors: {
        size: VECTOR_SIZE,
        distance: "Cosine",
      },
    });
  }
}

export async function bulkInsertVectors(logs: any[], vectors: number[][]) {
  const points = logs.map((log, index) => {
    const vector = vectors[index];

    if (!vector) {
      throw new Error(`Missing vector for log at index ${index}`);
    }

    return {
      id: log.id,
      vector,
      payload: {
        tenantId: log.tenantId,
        level: log.level,
        timestamp: log.timestamp,
      },
    };
  });

  await qdrantClient.upsert(COLLECTION_NAME, {
    wait: false,
    points: points,
  });
}
