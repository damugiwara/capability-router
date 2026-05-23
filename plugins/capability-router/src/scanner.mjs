import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

async function exists(file) {
  try {
    await readFile(file);
    return true;
  } catch {
    return false;
  }
}

async function walk(dir, predicate, out = []) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }

  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (
        ![
          "node_modules",
          ".git",
          "data",
          "dist",
          "sessions",
          "archived_sessions",
          ".tmp",
          "tmp",
          "sqlite"
        ].includes(entry.name)
      ) {
        await walk(full, predicate, out);
      }
    } else if (predicate(full)) {
      out.push(full);
    }
  }
  return out;
}

function parseFrontmatter(markdown) {
  const match = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return {};
  const result = {};
  for (const line of match[1].split(/\r?\n/)) {
    const field = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!field) continue;
    result[field[1]] = field[2].replace(/^["']|["']$/g, "");
  }
  return result;
}

function cleanMarkdownLine(line) {
  return line
    .replace(/^[#>\s-]*\s*/, "")
    .replace(/^[0-9]+[.)]\s*/, "")
    .replace(/[`*_()[\]{}]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function bodyExcerpt(markdown, maxLength = 2200) {
  const body = markdown.replace(/^---\r?\n[\s\S]*?\r?\n---/, "");
  const lines = body.split(/\r?\n/);
  const outline = [];
  const seen = new Set();

  const pushUnique = (value) => {
    const cleaned = cleanMarkdownLine(value);
    if (!cleaned || seen.has(cleaned.toLowerCase())) return;
    seen.add(cleaned.toLowerCase());
    outline.push(cleaned);
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (
      /^#{1,4}\s+/.test(trimmed) ||
      /^[-*]\s+/.test(trimmed) ||
      /^[0-9]+[.)]\s+/.test(trimmed) ||
      /--[A-Za-z0-9-]+/.test(trimmed) ||
      /\.(json|md|yaml|yml|toml|js|mjs|py|ts|tsx)\b/i.test(trimmed)
    ) {
      pushUnique(trimmed);
    }
  }

  body
    .replace(/```[\s\S]*?```/g, " ")
    .split(/\r?\n/)
    .map(cleanMarkdownLine)
    .filter(Boolean)
    .slice(0, 8)
    .forEach(pushUnique);

  return outline.join(" ").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function parseList(value) {
  if (Array.isArray(value)) return value;
  return String(value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export async function scanSkills(root) {
  const files = await walk(root, (file) => path.basename(file) === "SKILL.md");
  const records = [];
  for (const file of files) {
    const text = await readFile(file, "utf8");
    const frontmatter = parseFrontmatter(text);
    if (!frontmatter.name || !frontmatter.description) continue;
    records.push({
      id: `skill:${frontmatter.name}`,
      kind: "skill",
      name: frontmatter.name,
      description: frontmatter.description,
      source: file,
      provider: path.basename(path.dirname(path.dirname(file))),
      capabilities: parseList(frontmatter.capabilities),
      profileText: bodyExcerpt(text)
    });
  }
  return records;
}

export async function scanPlugins(root) {
  const files = await walk(root, (file) => file.endsWith(path.join(".codex-plugin", "plugin.json")));
  const records = [];
  for (const file of files) {
    const manifest = JSON.parse(await readFile(file, "utf8"));
    if (!manifest.name) continue;
    const description = [
      manifest.description,
      manifest.interface?.shortDescription,
      manifest.interface?.longDescription,
      ...(manifest.keywords ?? [])
    ]
      .filter(Boolean)
      .join(" ");
    records.push({
      id: `plugin:${manifest.name}`,
      kind: "plugin",
      name: manifest.name,
      description,
      source: file,
      provider: manifest.interface?.developerName ?? manifest.author?.name ?? "unknown",
      capabilities: [
        ...(manifest.keywords ?? []),
        ...(manifest.interface?.capabilities ?? [])
      ].map((capability) => String(capability).toLowerCase()),
      profileText: [
        manifest.interface?.displayName,
        ...(manifest.interface?.defaultPrompt ?? []),
        manifest.interface?.category
      ]
        .filter(Boolean)
        .join(" ")
    });
  }
  return records;
}

export async function scanBuiltins(pluginRoot) {
  const file = path.join(pluginRoot, "data", "builtin-capabilities.json");
  if (!(await exists(file))) return [];
  return JSON.parse(await readFile(file, "utf8"));
}

export async function scanCapabilities({ roots, pluginRoot, includeBuiltins = false }) {
  const normalizedRoots = [...new Set(roots.map((root) => path.resolve(root)))];
  const groups = await Promise.all(
    normalizedRoots.map(async (root) => [...(await scanSkills(root)), ...(await scanPlugins(root))])
  );
  const builtins = includeBuiltins ? await scanBuiltins(pluginRoot) : [];
  const byId = new Map();
  for (const record of [...builtins, ...groups.flat()]) {
    byId.set(record.id, record);
  }
  return [...byId.values()];
}
