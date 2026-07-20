import Redis from "ioredis";
import { prisma } from "@repo/db-core/client";
import crypto from "crypto";
import { generateVectors } from "./embedder";
import { bulkInsertLexical, ensureQuickwitIndex } from "./clients/quickwit";
import { bulkInsertVectors, ensureQdrantCollection } from "./clients/qdrant";
import type { SeverityLevel } from "@repo/db-core/severity";

const redis = new Redis(process.env.REDIS_URL || "redis://localhost:6379");
const BATCH_SIZE = 100;

async function processQueue() {
  console.log("Workers started. Listeing for logs...");

  await ensureQuickwitIndex();
  await ensureQdrantCollection();

  while (true) {
    try {
      const batchRaw = await redis.lpop("log_pipeline_queue", BATCH_SIZE);

      if (!batchRaw || batchRaw.length === 0) {
        await new Promise((res) => setTimeout(res, 500));
        continue;
      }

      const logs = batchRaw.map((raw) => {
        const parsed = JSON.parse(raw);
        return {
          ...parsed,
          id: crypto.randomUUID(),
          environment: parsed.environment || "production",
          timestamp: parsed.timestamp || new Date().toISOString(),
          statusCode: parsed.statusCode ? parseInt(String(parsed.statusCode), 10) : null,
        };
      });

      const textsToEmbed = logs.map((l) => l.message);
      const vectors = await generateVectors(textsToEmbed);

      await Promise.all([
        bulkInsertLexical(logs),

        bulkInsertVectors(logs, vectors),

        prisma.logMetadata.createMany({
          data: logs.map((l) => ({
            qwId: l.id,
            qdrantId: l.id,
            tenantId: l.tenantId,
            level: l.level as SeverityLevel,
            serviceName: l.source || l.serviceName || "unknown",
            timeStamp: new Date(l.timestamp),
            environment: l.environment,
            statusCode: l.statusCode,
          })),
        }),
      ]);
    } catch (err) {
      console.error("batch processing error", err);
    }
  }
}

processQueue();
