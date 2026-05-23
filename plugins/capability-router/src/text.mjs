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

export function tokenize(text) {
  return String(text ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9_.:-]+/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 1 && !STOP_WORDS.has(token));
}

export function inferCapabilities(text) {
  const source = String(text ?? "").toLowerCase();
  const capabilities = new Set();
  const checks = [
    ["network", /\b(web|internet|url|website|wikipedia|browser|search|http|https|online|current|latest)\b/],
    ["web", /\b(web|internet|url|website|wikipedia|search|http|https|online|page|citation|citations|source|sources)\b/],
    ["browser", /\b(browser|click|screenshot|page|dom|localhost)\b/],
    ["filesystem", /\b(file|folder|directory|repo|code|edit|patch|test|build|shell|terminal)\b/],
    ["editing", /\b(edit|modify|patch|write|create|change|fix|implement)\b/],
    ["planning", /\b(plan|break down|roadmap|steps|checklist)\b/],
    ["image", /\b(image|picture|photo|generate|edit image|logo)\b/],
    ["database", /\b(database|sql|postgres|supabase|table|query)\b/],
    ["research", /\b(research|summarize|source|cite|look up|find)\b/]
  ];

  for (const [capability, pattern] of checks) {
    if (pattern.test(source)) capabilities.add(capability);
  }
  return [...capabilities];
}

export function scoreText(query, record) {
  const queryTokens = tokenize(query);
  const recordText = [record.kind, record.name, record.description, ...(record.capabilities ?? [])].join(" ");
  const recordTokens = new Set(tokenize(recordText));
  const matches = queryTokens.filter((token) => recordTokens.has(token));
  const exactNameBoost = String(query).toLowerCase().includes(String(record.name).toLowerCase()) ? 2 : 0;
  const inferred = inferCapabilities(query);
  const capabilityBoost = inferred.filter((capability) => (record.capabilities ?? []).includes(capability)).length;
  const intentBoost = scoreIntent(query, record, inferred);
  const score = matches.length + exactNameBoost + capabilityBoost * 1.5 + intentBoost;
  return { score, matches };
}

function scoreIntent(query, record, inferred) {
  const source = String(query ?? "").toLowerCase();
  let boost = 0;

  if (inferred.includes("web") && record.kind === "tool" && ["web.open", "web.search_query"].includes(record.name)) {
    boost += source.includes("search") || source.includes("find") ? 3 : 4;
  }

  if (/\b(edit|modify|patch|fix|implement)\b/.test(source)) {
    if (record.name === "functions.apply_patch") boost += 3;
    if (record.name === "functions.shell_command") boost += 1;
  }

  if (/\b(test|build|run|shell|terminal|command)\b/.test(source) && record.name === "functions.shell_command") {
    boost += 3;
  }

  if (/\b(image|photo|picture|logo)\b/.test(source) && record.name === "image_gen.imagegen") {
    boost += 4;
  }

  return boost;
}
