import { embed, embedMany, embeddingsEnabled } from "./embeddings";
import { loadKnowledgeChunks } from "./knowledge";
import {
  loadIndex,
  saveIndex,
  cosineSimilarity,
  type VectorIndex,
  type StoredChunk,
} from "./vectorStore";
import type { RetrievedChunk } from "@/types";

const MODEL = process.env.EMBEDDING_MODEL || "Xenova/all-MiniLM-L6-v2";
let buildPromise: Promise<VectorIndex> | null = null;

async function buildIndex(): Promise<VectorIndex> {
  const knowledge = await loadKnowledgeChunks();
  const existing = await loadIndex();

  // Reuse the persisted index when it still matches the current knowledge base.
  if (existing && existing.model === MODEL && existing.chunks.length === knowledge.length) {
    return existing;
  }

  const embeddings = await embedMany(knowledge.map((k) => k.text));
  const chunks: StoredChunk[] = knowledge.map((k, i) => ({
    id: k.id,
    source: k.source,
    text: k.text,
    embedding: embeddings[i],
  }));

  const index: VectorIndex = { model: MODEL, chunks };
  try {
    await saveIndex(index);
  } catch (err) {
    console.warn("Could not persist vector index (continuing running safely in-memory):", err);
  }
  return index;
}

async function getIndex(): Promise<VectorIndex> {
  if (!buildPromise) buildPromise = buildIndex();
  return buildPromise;
}

function keywordScore(query: string, text: string): number {
  const terms = query
    .toLowerCase()
    .split(/\W+/)
    .filter((w) => w.length > 2);
  if (!terms.length) return 0;
  const haystack = text.toLowerCase();
  let hits = 0;
  for (const term of terms) if (haystack.includes(term)) hits += 1;
  return hits / terms.length;
}

export async function retrieve(query: string, topK = 4): Promise<RetrievedChunk[]> {
  const index = await getIndex();
  const queryEmbedding = embeddingsEnabled() ? await embed(query) : null;

  const scored = index.chunks.map((c) => {
    const score =
      queryEmbedding && c.embedding
        ? cosineSimilarity(queryEmbedding, c.embedding)
        : keywordScore(query, c.text);
    return { id: c.id, source: c.source, text: c.text, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, topK);
}