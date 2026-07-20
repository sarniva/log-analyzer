import type { MiddlewareHandler } from "hono";
import { redisClient } from "../queue";
import { prisma } from "@repo/db-core/client";

type GatewayAppEnv = {
  Variables: {
    tenantId: string;
  };
};

const DEV_API_KEY = "mock-tenant-uuid";
const DEV_TENANT_SLUG = "dev-tenant";
const DEV_TENANT_NAME = "Development Tenant";

async function ensureDevApiKey() {
  const tenant = await prisma.tenant.upsert({
    where: { slug: DEV_TENANT_SLUG },
    update: {},
    create: {
      name: DEV_TENANT_NAME,
      slug: DEV_TENANT_SLUG,
    },
    select: { id: true },
  });

  await prisma.apiKey.upsert({
    where: { key: DEV_API_KEY },
    update: {
      tenantId: tenant.id,
      isActive: true,
    },
    create: {
      key: DEV_API_KEY,
      name: "Development Load Test Key",
      tenantId: tenant.id,
      isActive: true,
    },
  });

  return tenant.id;
}

export const authMiddleware: MiddlewareHandler<GatewayAppEnv> = async (c, next) => {
  const apiKey = c.req.header("X-API-Key");

  if (!apiKey) {
    return c.json({ error: "Missing Authentication" }, 401);
  }

  let tenantId = await redisClient.get(`apikey_cache:${apiKey}`);

  if (!tenantId && apiKey === DEV_API_KEY) {
    const devTenantId = await ensureDevApiKey();
    tenantId = devTenantId;
    await redisClient.setex(`apikey_cache:${apiKey}`, 300, devTenantId);
  }

  if (!tenantId) {
    const record = await prisma.apiKey.findUnique({
      where: { key: apiKey },
      select: { tenantId: true, isActive: true },
    });

    if (!record || !record.isActive) {
      return c.json({ error: "Invalid or revoked API key" }, 403);
    }

    const resolvedTenantId = record.tenantId;
    tenantId = resolvedTenantId;

    await redisClient.setex(`apikey_cache:${apiKey}`, 300, resolvedTenantId);
  }

  c.set("tenantId", tenantId);

  await next();
};
