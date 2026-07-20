import { Hono } from "hono";
import { logger } from "hono/logger";
import { authMiddleware } from "./middlewares/auth";
import { rateLimitMiddleware } from "./middlewares/rateLimit";
import { pushToQueue } from "./queue";

type GatewayAppEnv = {
  Variables: {
    tenantId: string;
  };
};

const app = new Hono<GatewayAppEnv>();

app.use("*", logger());
app.use("/v1/ingest", authMiddleware);
app.use("/v1/ingest", rateLimitMiddleware);

app.post("/v1/ingest", async (c) => {
  try {
    const body = await c.req.json();

    const tenantId = c.var.tenantId;

    const logPayload = JSON.stringify({
      tenantId,
      message: body.message,
      source: body.source || "unknown",
      level: body.level || "INFO",
      timestamp: body.timestamp || new Date().toISOString(),
    });

    await pushToQueue(logPayload);

    return c.json({ status: "Accepted" }, 202);
  } catch (err) {
    return c.json(
      {
        error: "Invalid Payload",
      },
      400,
    );
  }
});

export default app;
