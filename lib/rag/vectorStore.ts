import { promises as fs } from "fs";
import path from "path";

export interface StoredChunk {
  id: string;
  source: string;
  text: string;
  embedding: number[] | null;
}

export interface VectorIndex {
  model: string;
  chunks: StoredChunk[];
}

function storePath(): string {
  const rel = process.env.VECTOR_STORE_PATH || ".rag/index.json";
  return path.isAbsolute(rel) ? rel : path.join(process.cwd(), rel);
}

export async function loadIndex(): Promise<VectorIndex | null> {
  try {
    const raw = await fs.readFile(storePath(), "utf-8");
    return JSON.parse(raw) as VectorIndex;
  } catch {
    return null;
  }
}

export async function saveIndex(index: VectorIndex): Promise<void> {
  const p = storePath();
  await fs.mkdir(path.dirname(p), { recursive: true });
  await fs.writeFile(p, JSON.stringify(index), "utf-8");
}

export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}
