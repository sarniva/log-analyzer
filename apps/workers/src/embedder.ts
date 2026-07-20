import { pipeline, env } from "@huggingface/transformers";

env.allowLocalModels = true;

let embedder: any = null;

export async function getEmbedder() {
  if (!embedder) {
    embedder = await pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2");
  }

  return embedder;
}

export async function generateVectors(texts: string[]): Promise<number[][]> {
  const model = await getEmbedder();

  const output = await model(texts, { pooling: "mean", normalize: true });
  return output.tolist();
}
