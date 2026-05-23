import { CacheStore, stableHash } from "./cache.mjs";
import { applyPolicy } from "./policy.mjs";
import { getSemanticCache, setSemanticCache } from "./semantic-cache.mjs";
import { scoreText } from "./text.mjs";
import { capabilityHash, searchVectorStore } from "./vector-store.mjs";

function confidenceFromScore(score, bestScore) {
  if (score <= 0) return 0;
  const relative = bestScore > 0 ? score / bestScore : 0;
  return Number(Math.min(0.98, 0.35 + relative * 0.55).toFixed(2));
}

export async function selectCapabilities({
  request,
  records,
  constraints = {},
  topK = 5,
  cacheFile = null,
  vectorFile = null,
  vectorDimensions = 256,
  semanticCacheFile = null,
  semanticCacheThreshold = 0.82
}) {
  const cache = cacheFile ? new CacheStore(cacheFile) : null;
  const capabilitySetHash = stableHash(records.map((record) => [record.id, capabilityHash(record)]).sort());
  const constraintsHash = stableHash(constraints);
  const key = stableHash({
    request,
    capabilitySetHash,
    constraintsHash,
    topK,
    vectorFile: Boolean(vectorFile),
    vectorDimensions,
    semanticCacheFile: Boolean(semanticCacheFile)
  });
  if (cache) {
    const cached = await cache.getRequest(key);
    if (cached) return { ...cached, cache: { hit: true } };
  }

  if (semanticCacheFile) {
    const semanticHit = await getSemanticCache({
      cacheFile: semanticCacheFile,
      request,
      capabilitySetHash,
      constraintsHash,
      threshold: semanticCacheThreshold,
      dimensions: vectorDimensions
    });
    if (semanticHit.hit) {
      return {
        ...semanticHit.result,
        cache: { hit: false },
        semanticCache: {
          hit: true,
          similarity: Number(semanticHit.similarity.toFixed(4)),
          matchedRequest: semanticHit.matchedRequest
        }
      };
    }
  }

  const policy = applyPolicy(records, constraints);

  const vectorSearch = vectorFile
    ? await searchVectorStore({
        request,
        records: policy.allowed,
        vectorFile,
        topK: Math.max(policy.allowed.length, topK * 8),
        dimensions: vectorDimensions
      })
    : null;
  const vectorScores = new Map((vectorSearch?.results ?? []).map((item) => [item.record.id, item.vectorScore]));

  const scored = policy.allowed
    .map((record) => {
      const scoredRecord = scoreText(request, record);
      const vectorScore = vectorScores.get(record.id) ?? 0;
      return {
        record,
        ...scoredRecord,
        vectorScore,
        score: scoredRecord.score + Math.max(0, vectorScore) * 8
      };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.record.name.localeCompare(b.record.name));

  const bestScore = scored[0]?.score ?? 0;
  const recommended = scored.slice(0, topK).map((item) => ({
    id: item.record.id,
    kind: item.record.kind,
    name: item.record.name,
    confidence: confidenceFromScore(item.score, bestScore),
    reason:
      item.vectorScore > 0.05
        ? `Vector similarity ${item.vectorScore.toFixed(2)}${
            item.matches.length ? `; matched ${item.matches.slice(0, 5).join(", ")}` : ""
          }.`
        : item.matches.length
          ? `Matched ${item.matches.slice(0, 5).join(", ")}.`
          : "Matched inferred task capabilities.",
    source: item.record.source ?? null,
    capabilities: item.record.capabilities ?? []
  }));

  const result = {
    recommended,
    alternates: recommended.slice(1),
    maskedOutSummary: policy.maskedOutSummary,
    contextSavings: {
      totalCapabilitiesIndexed: records.length,
      capabilitiesConsideredAfterPolicy: policy.allowed.length,
      capabilitiesReturned: recommended.length,
      vectorCandidatesConsidered: vectorSearch?.results.length ?? 0
    },
    retrieval: {
      mode: vectorFile ? "hybrid-vector" : "lexical",
      vectorProvider: vectorSearch?.provider ?? null,
      vectorDimensions: vectorSearch?.dimensions ?? null
    },
    semanticCache: {
      hit: false
    },
    cache: { hit: false }
  };

  if (semanticCacheFile) {
    await setSemanticCache({
      cacheFile: semanticCacheFile,
      request,
      capabilitySetHash,
      constraintsHash,
      result,
      dimensions: vectorDimensions
    });
  }

  if (cache) await cache.setRequest(key, result);
  return result;
}
