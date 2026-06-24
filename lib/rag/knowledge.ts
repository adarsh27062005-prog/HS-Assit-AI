import { promises as fs } from "fs";
import path from "path";

export interface KnowledgeChunk {
  id: string;
  source: string;
  text: string;
}

// Reads every markdown file in /knowledge and splits it into chunks on H2 (## ) headings,
// which keeps each anomaly rule / dictionary section as a self-contained retrievable unit.
export async function loadKnowledgeChunks(): Promise<KnowledgeChunk[]> {
  const dir = path.join(/* turbopackIgnore: true */ process.cwd(), "knowledge");
  let files: string[] = [];
  try {
    files = (await fs.readdir(dir)).filter((f) => f.toLowerCase().endsWith(".md"));
  } catch {
    return [];
  }

  const chunks: KnowledgeChunk[] = [];
  for (const file of files) {
    const content = await fs.readFile(path.join(dir, file), "utf-8");
    const sections = content.split(/\n(?=##\s)/g);
    sections.forEach((section, i) => {
      const text = section.trim();
      if (text.length > 0) {
        chunks.push({ id: `${file}#${i}`, source: file, text });
      }
    });
  }
  return chunks;
}
