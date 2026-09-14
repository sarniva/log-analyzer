import "server-only";
import { env, pipeline } from "@huggingface/transformers";

env.allowLocalModels = true;

type FeatureExtractor = (input: string, options: { pooling: "mean"; normalize: true }) => Promise<{
  tolist(): number[] | number[][];
}>;

let embedderPromise: Promise<FeatureExtractor> | null = null;

async function getEmbedder() {
  if (!embedderPromise) {
    embedderPromise = pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2").then(
      (instance) => instance as unknown as FeatureExtractor,
    );
  }

  return embedderPromise;
}

export async function embedQuery(query: string): Promise<number[]> {
  const model = await getEmbedder();
  const output = await model(query, { pooling: "mean", normalize: true });
  const list = output.tolist();

  if (Array.isArray(list[0])) {
    return list[0] as number[];
  }

  return list as number[];
}
