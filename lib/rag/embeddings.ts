import type { FeatureExtractionPipeline } from "@huggingface/transformers";

// Lazily-loaded local embedding model (runs in Node via onnxruntime, no API key).
let extractorPromise: Promise<FeatureExtractionPipeline> | null = null;
let embeddingsAvailable = true;

export function embeddingsEnabled(): boolean {
  return embeddingsAvailable;
}

async function getExtractor(): Promise<FeatureExtractionPipeline> {
  if (!extractorPromise) {
    extractorPromise = (async () => {
      const { pipeline, env } = await import("@huggingface/transformers");
      env.allowRemoteModels = true;
      const model = process.env.EMBEDDING_MODEL || "Xenova/all-MiniLM-L6-v2";
      return (await pipeline("feature-extraction", model)) as FeatureExtractionPipeline;
    })();
  }
  return extractorPromise;
}

export async function embed(text: string): Promise<number[] | null> {
  try {
    const extractor = await getExtractor();
    const output = await extractor(text, { pooling: "mean", normalize: true });
    return Array.from(output.data as Float32Array);
  } catch (err) {
    // If the model can't load (offline, native binary issue, etc.) we disable
    // embeddings and the retriever transparently falls back to keyword search.
    console.error("Embedding unavailable, falling back to keyword search:", err);
    embeddingsAvailable = false;
    extractorPromise = null;
    return null;
  }
}

export async function embedMany(texts: string[]): Promise<(number[] | null)[]> {
  const results: (number[] | null)[] = [];
  for (const t of texts) results.push(await embed(t));
  return results;
}
