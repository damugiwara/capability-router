import { createHash } from "node:crypto";

const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "by",
  "for",
  "from",
  "how",
  "i",
  "in",
  "is",
  "it",
  "of",
  "on",
  "or",
  "that",
  "the",
  "this",
  "to",
  "use",
  "using",
  "when",
  "with",
  "you"
]);

function splitIdentifier(text) {
  return String(text ?? "")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[^A-Za-z0-9+.-]+/g, " ")
    .replace(/[_.:/\\-]+/g, " ");
}

function baseTokens(text) {
  return splitIdentifier(text)
    .toLowerCase()
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 1 && !STOP_WORDS.has(token));
}

function normalizeQueryText(text) {
  return String(text ?? "")
    .replace(/https?:\/\/\S+/gi, " url website webpage page ")
    .replace(/\b[\w.-]+[\\/][\w./\\-]+\b/g, " local source code repository ");
}

export function tokenize(text, { semantic = false } = {}) {
  const tokens = baseTokens(text);
  const expanded = new Set();

  for (const token of tokens) {
    expanded.add(token);
    for (const variant of tokenVariants(token, { semantic })) {
      if (variant.length > 1 && !STOP_WORDS.has(variant)) expanded.add(variant);
    }
  }

  return [...expanded];
}

function queryTermWeights(text) {
  const weights = new Map();
  const rawTokens = splitIdentifier(normalizeQueryText(text))
    .toLowerCase()
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean);
  const tokens = [];
  let modifierFactor = 1;
  const firstContentToken = rawTokens.find((token) => token.length > 1 && !STOP_WORDS.has(token));
  const authoringRequest = ["author", "create", "created", "creating", "write", "writing", "wrote"].includes(
    firstContentToken
  );

  rawTokens.forEach((token, rawIndex) => {
    if (["with", "using", "via"].includes(token)) {
      modifierFactor = 1;
      return;
    }
    if (authoringRequest && ["for", "about", "regarding"].includes(token) && rawIndex >= 3) {
      modifierFactor = 0.35;
      return;
    }
    if (token.length <= 1 || STOP_WORDS.has(token)) return;
    tokens.push({ token, modifierFactor });
  });

  tokens.forEach(({ token, modifierFactor: factor }, index) => {
    const positionalWeight = Math.max(0.7, 2.2 - index * 0.22);
    const weightedPosition = positionalWeight * factor;
    weights.set(token, Math.max(weights.get(token) ?? 0, weightedPosition));
    for (const variant of tokenVariants(token, { semantic: true })) {
      if (variant.length > 1 && !STOP_WORDS.has(variant)) {
        weights.set(variant, Math.max(weights.get(variant) ?? 0, weightedPosition * 0.8));
      }
    }
  });

  return weights;
}

function tokenVariants(token, { semantic = false } = {}) {
  const variants = [];
  if (semantic) {
    const authoring = Object.assign(Object.create(null), {
      author: ["create"],
      authored: ["created", "wrote"],
      created: ["authored"],
      creating: ["authoring"],
      write: ["author", "create"],
      writer: ["author", "creator"],
      writing: ["authoring", "creating"],
      wrote: ["authored", "created"]
    });
    if (authoring[token]) variants.push(...authoring[token]);
  }
  if (token.includes("+")) {
    variants.push(token.replace(/\+/g, "p"), token.replace(/\+/g, "plus"));
  }
  if (token.endsWith("ing") && token.length > 5) {
    const root = token.slice(0, -3);
    variants.push(root);
    if (/(at|it|ak|iv|iz)$/.test(root)) variants.push(`${root}e`);
  }
  if (token.endsWith("ed") && token.length > 4) variants.push(token.slice(0, -2));
  if (token.endsWith("ies") && token.length > 5) variants.push(`${token.slice(0, -3)}y`);
  if (token.endsWith("s") && token.length > 4) variants.push(token.slice(0, -1));
  if ((token.endsWith("er") || token.endsWith("or")) && token.length > 5) {
    const root = token.slice(0, -2);
    variants.push(root, `${root}e`);
  }
  if (token.endsWith("ion") && token.length > 6) {
    const root = token.slice(0, -3);
    variants.push(root, `${root}e`);
  }
  return variants;
}

function stableHash(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function compactText(value, maxLength = 1600) {
  return String(value ?? "")
    .replace(/^---[\s\S]*?---/m, " ")
    .replace(/[`*_#[\](){}>~-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

export function buildCapabilityProfile(record) {
  const weightedFields = [
    [record.id, 2],
    [record.kind, 0.5],
    [record.name, 4],
    [(record.capabilities ?? []).join(" "), 3],
    [record.description, 2],
    [record.provider, 0.4],
    [record.source, 0.25],
    [record.profileText, 0.2]
  ];
  const text = compactText(weightedFields.map(([value]) => value).filter(Boolean).join(" "));
  const termCounts = new Map();
  let length = 0;

  for (const [value, weight] of weightedFields) {
    for (const term of tokenize(value)) {
      termCounts.set(term, (termCounts.get(term) ?? 0) + weight);
      length += weight;
    }
  }
  const terms = [...termCounts.keys()];

  return {
    id: record.id,
    kind: record.kind,
    name: record.name,
    text,
    terms,
    termCounts,
    length,
    profileHash: stableHash({
      id: record.id,
      kind: record.kind,
      name: record.name,
      provider: record.provider ?? null,
      source: record.source ?? null,
      description: record.description ?? "",
      capabilities: record.capabilities ?? [],
      profileText: record.profileText ?? ""
    })
  };
}

export function buildCorpusStats(records) {
  const profiles = new Map();
  const documentFrequency = new Map();
  let totalLength = 0;

  for (const record of records) {
    const profile = buildCapabilityProfile(record);
    profiles.set(record.id, profile);
    totalLength += profile.length;

    for (const term of new Set(profile.terms)) {
      documentFrequency.set(term, (documentFrequency.get(term) ?? 0) + 1);
    }
  }

  return {
    totalDocuments: records.length,
    averageLength: records.length ? totalLength / records.length : 0,
    documentFrequency,
    profiles
  };
}

function idf(term, stats) {
  const total = Math.max(1, stats.totalDocuments ?? 0);
  const frequency = stats.documentFrequency?.get(term) ?? 0;
  return Math.log(1 + (total - frequency + 0.5) / (frequency + 0.5));
}

function bm25(queryWeights, profile, stats) {
  const averageLength = stats.averageLength || profile.length || 1;
  const k1 = 1.2;
  const b = 0.75;
  let score = 0;

  for (const [term, queryWeight] of queryWeights) {
    const frequency = profile.termCounts.get(term) ?? 0;
    if (!frequency) continue;
    const denominator = frequency + k1 * (1 - b + b * (profile.length / averageLength));
    score += queryWeight * idf(term, stats) * ((frequency * (k1 + 1)) / denominator);
  }

  return score;
}

function phraseOverlap(queryTerms, profile) {
  if (!queryTerms.length || !profile.terms.length) return 0;
  const recordPhrases = [
    tokenize(profile.name).join(" "),
    profile.id ? tokenize(profile.id).join(" ") : ""
  ].filter(Boolean);
  const queryText = queryTerms.join(" ");
  let score = 0;

  for (const phrase of recordPhrases) {
    if (phrase && queryText.includes(phrase)) {
      score += Math.min(4, phrase.split(/\s+/).length);
    }
  }

  return score;
}

function metadataPhraseOverlap(query, profile) {
  const queryTokens = baseTokens(normalizeQueryText(query));
  if (queryTokens.length < 2 || !profile.text) return 0;

  const profileText = baseTokens(profile.text).join(" ");
  const phrases = new Set();
  for (let size = 2; size <= 3; size += 1) {
    for (let index = 0; index <= queryTokens.length - size; index += 1) {
      phrases.add(queryTokens.slice(index, index + size).join(" "));
    }
  }

  let score = 0;
  for (const phrase of phrases) {
    if (profileText.includes(phrase)) score += phrase.split(" ").length * 1.25;
  }
  return score;
}

function nameCoverage(queryTerms, profile) {
  const nameTerms = baseTokens(profile.name);
  if (!nameTerms.length) return 0;
  const querySet = new Set(queryTerms);
  const matched = nameTerms.filter((term) => {
    if (querySet.has(term)) return true;
    return tokenVariants(term).some((variant) => querySet.has(variant));
  }).length;
  const coverage = matched / nameTerms.length;
  return matched ? coverage * coverage * 22 : 0;
}

export function scoreText(query, record, stats = null) {
  const corpusStats = stats ?? buildCorpusStats([record]);
  const profile = corpusStats.profiles?.get(record.id) ?? buildCapabilityProfile(record);
  const queryWeights = queryTermWeights(query);
  const queryTerms = [...queryWeights.keys()];
  const querySet = new Set(queryTerms);
  const matches = [...new Set(profile.terms.filter((term) => querySet.has(term)))];
  const score =
    bm25(queryWeights, profile, corpusStats) +
    phraseOverlap(queryTerms, profile) +
    metadataPhraseOverlap(query, profile) +
    nameCoverage(queryTerms, profile);

  return {
    score,
    matches,
    profileHash: profile.profileHash
  };
}
