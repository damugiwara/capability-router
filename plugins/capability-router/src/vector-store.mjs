import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

import { stableHash } from "./cache.mjs";
import { cosineSimilarity, embedText } from "./embeddings.mjs";

async function readJson(file, fallback) {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch {
    return fallback;
  }
}

async function writeJson(file, value) {
  await mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  await writeFile(tmp, JSON.stringify(value, null, 2));
  await rename(tmp, file);
}

export function capabilityText(record) {
  return [record.kind, record.name, record.description, ...(record.capabilities ?? [])]
    .filter(Boolean)
    .join(" ");
}

export function capabilityHash(record) {
  return stableHash({
    id: record.id,
    kind: record.kind,
    name: record.name,
    description: record.description,
    capabilities: record.capabilities ?? []
  });
}

export async function refreshVectorStore({ records, vectorFile, dimensions = 256 }) {
  const existing = await readJson(vectorFile, {
    version: 1,
    provider: "local-hash-embedding",
    dimensions,
    records: {}
  });

  const next = {
    version: 1,
    provider: "local-hash-embedding",
    dimensions,
    refreshedAt: new Date().toISOString(),
    records: {}
  };

  for (const record of records) {
    const hash = capabilityHash(record);
    const cached = existing.records?.[record.id];
    next.records[record.id] =
      cached?.hash === hash && cached?.dimensions === dimensions
        ? cached
        : {
            hash,
            dimensions,
            vector: embedText(capabilityText(record), { dimensions })
          };
  }

  await writeJson(vectorFile, next);
  return next;
}

export async function searchVectorStore({ request, records, vectorFile, topK = 20, dimensions = 256 }) {
  const store = await refreshVectorStore({ records, vectorFile, dimensions });
  const queryVector = embedText(request, { dimensions });
  const byId = new Map(records.map((record) => [record.id, record]));

  const results = Object.entries(store.records)
    .map(([id, entry]) => ({
      record: byId.get(id),
      vectorScore: cosineSimilarity(queryVector, entry.vector)
    }))
    .filter((item) => item.record && Number.isFinite(item.vectorScore))
    .sort((a, b) => b.vectorScore - a.vectorScore || a.record.name.localeCompare(b.record.name))
    .slice(0, topK);

  return {
    provider: store.provider,
    dimensions: store.dimensions,
    results
  };
}
