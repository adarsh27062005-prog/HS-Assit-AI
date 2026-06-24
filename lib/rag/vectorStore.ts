import { promises as fs } from "fs";
import os from "os";
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
  const envPath = process.env.VECTOR_STORE_PATH;
  
  if (envPath) {
    return path.isAbsolute(envPath) ? envPath : path.join(process.cwd(), envPath);
  }

  // If running on Vercel/Production, store in /tmp to avoid read-only system errors.
  // Otherwise, scope it strictly to a dedicated local directory to stop loose tracing.
  if (process.env.NODE_ENV === "production") {
    return path.join(os.tmpdir(), "rag-index.json");
  }

  // Statically scoped to process.cwd() explicitly using a hardcoded folder string
  return path.join(process.cwd(), ".rag", "index.json");
}

export async function loadIndex(): Promise<VectorIndex | null> {
  try {
    const targetPath = storePath();
    const raw = await fs.readFile(targetPath, "utf-8");
    return JSON.parse(raw) as VectorIndex;
  } catch {
    return null;
  }
}

export async function saveIndex(index: VectorIndex): Promise<void> {
  try {
    const targetPath = storePath();
    await fs.mkdir(path.dirname(targetPath), { recursive: true });
    await fs.writeFile(targetPath, JSON.stringify(index), "utf-8");
  } catch (err) {
    console.error("Failed to write index to disk:", err);
    throw err; // Let the caller know it failed so it can fall back in-memory
  }
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