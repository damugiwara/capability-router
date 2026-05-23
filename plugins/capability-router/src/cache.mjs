import { createHash } from "node:crypto";
import { readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

async function readJson(file, fallback) {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch {
    return fallback;
  }
}

async function sha256File(file) {
  const bytes = await readFile(file);
  return createHash("sha256").update(bytes).digest("hex");
}

export function stableHash(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export class CacheStore {
  constructor(file) {
    this.file = file;
    this.data = null;
  }

  async load() {
    if (!this.data) {
      this.data = await readJson(this.file, { files: {}, requests: {}, updatedAt: null });
    }
    return this.data;
  }

  async save() {
    const data = await this.load();
    data.updatedAt = new Date().toISOString();
    const tmp = `${this.file}.tmp`;
    await writeFile(tmp, JSON.stringify(data, null, 2));
    await rename(tmp, this.file);
  }

  async hasFreshFile(file) {
    const data = await this.load();
    const current = await sha256File(file);
    return data.files[path.resolve(file)] === current;
  }

  async rememberFile(file) {
    const data = await this.load();
    data.files[path.resolve(file)] = await sha256File(file);
    await this.save();
  }

  async getRequest(key) {
    const data = await this.load();
    return data.requests[key] ?? null;
  }

  async setRequest(key, value) {
    const data = await this.load();
    data.requests[key] = value;
    await this.save();
  }
}
