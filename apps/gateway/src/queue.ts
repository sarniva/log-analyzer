import Redis from "ioredis";

export const redisClient = new Redis(
  process.env.REDIS_URL || "redis://localhost:6379",
);

redisClient.on("error", (err) => {
  console.error("Redis connection error", err);
});

export async function pushToQueue(payload: string): Promise<void> {
  await redisClient.rpush("log_pipeline_queue", payload);
}
