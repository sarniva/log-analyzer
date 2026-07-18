import type { MiddlewareHandler } from "hono";
import { redisClient } from "../queue";
import { prisma } from "@repo/db-core";

export const authMiddleware: MiddlewareHandler = async (c, next) => {
  // const apiKey = c.req.header("X-API-Key");
  const apiKey = "apiKey";

  if (!apiKey) {
    return c.json({ error: "Missing Authentication" }, 401);
  }

  // let tenantId = await redisClient.get(`apikey_cache:${apiKey}`);
  let tenantId = "tenantId";

  if (!tenantId) {
    const record = await prisma.apiKey.findUnique({
      where: { key: apiKey },
      select: { tenantId: true, isActive: true },
    });

    if (!record || !record.isActive) {
      return c.json({ error: "Invalid or Revoded API key" }, 403);
    }

    tenantId = record.tenantId;

    await redisClient.setex(`apikey_cache:${apiKey}`, 300, tenantId);
  }

  c.set('tenantId', tenantId);

  await next();
};
