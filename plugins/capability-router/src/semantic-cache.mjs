import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

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

function normalizeRequest(request) {
  return String(request ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9_.:-]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export async function getSemanticCache({
  cacheFile,
  request,
  capabilitySetHash,
  constraintsHash,
  threshold = 0.82,
  dimensions = 256
}) {
  const cache = await readJson(cacheFile, { version: 1, provider: "local-hash-embedding", dimensions, entries: [] });
  const requestVector = embedText(request, { dimensions });
  const candidates = (cache.entries ?? [])
    .filter(
      (entry) =>
        entry.capabilitySetHash === capabilitySetHash &&
        entry.constraintsHash === constraintsHash &&
        entry.dimensions === dimensions
    )
    .map((entry) => ({
      entry,
      similarity: cosineSimilarity(requestVector, entry.requestVector ?? [])
    }))
    .sort((a, b) => b.similarity - a.similarity);

  const best = candidates[0];
  if (!best || best.similarity < threshold) {
    return { hit: false, similarity: best?.similarity ?? 0 };
  }

  return {
    hit: true,
    similarity: best.similarity,
    result: best.entry.result,
    matchedRequest: best.entry.normalizedRequest
  };
}

export async function setSemanticCache({
  cacheFile,
  request,
  capabilitySetHash,
  constraintsHash,
  result,
  dimensions = 256,
  maxEntries = 200
}) {
  const cache = await readJson(cacheFile, { version: 1, provider: "local-hash-embedding", dimensions, entries: [] });
  const normalizedRequest = normalizeRequest(request);
  const requestVector = embedText(request, { dimensions });
  const entry = {
    normalizedRequest,
    requestVector,
    capabilitySetHash,
    constraintsHash,
    dimensions,
    result,
    createdAt: new Date().toISOString()
  };

  const entries = (cache.entries ?? []).filter(
    (existing) =>
      !(
        existing.normalizedRequest === normalizedRequest &&
        existing.capabilitySetHash === capabilitySetHash &&
        existing.constraintsHash === constraintsHash &&
        existing.dimensions === dimensions
      )
  );
  entries.unshift(entry);

  const next = {
    version: 1,
    provider: "local-hash-embedding",
    dimensions,
    updatedAt: new Date().toISOString(),
    entries: entries.slice(0, maxEntries)
  };

  await writeJson(cacheFile, next);
  return entry;
}
