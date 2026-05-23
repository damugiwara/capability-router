import { CacheStore, stableHash } from "./cache.mjs";
import { applyPolicy } from "./policy.mjs";
import { scoreText } from "./text.mjs";

function confidenceFromScore(score, bestScore) {
  if (score <= 0) return 0;
  const relative = bestScore > 0 ? score / bestScore : 0;
  return Number(Math.min(0.98, 0.35 + relative * 0.55).toFixed(2));
}

export async function selectCapabilities({ request, records, constraints = {}, topK = 5, cacheFile = null }) {
  const cache = cacheFile ? new CacheStore(cacheFile) : null;
  const key = stableHash({ request, recordIds: records.map((record) => record.id).sort(), constraints, topK });
  if (cache) {
    const cached = await cache.getRequest(key);
    if (cached) return { ...cached, cache: { hit: true } };
  }

  const policy = applyPolicy(records, constraints);
  const scored = policy.allowed
    .map((record) => {
      const scoredRecord = scoreText(request, record);
      return { record, ...scoredRecord };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.record.name.localeCompare(b.record.name));

  const bestScore = scored[0]?.score ?? 0;
  const recommended = scored.slice(0, topK).map((item) => ({
    id: item.record.id,
    kind: item.record.kind,
    name: item.record.name,
    confidence: confidenceFromScore(item.score, bestScore),
    reason: item.matches.length
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
      capabilitiesReturned: recommended.length
    },
    cache: { hit: false }
  };

  if (cache) await cache.setRequest(key, result);
  return result;
}
