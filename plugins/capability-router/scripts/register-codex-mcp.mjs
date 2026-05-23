#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pluginRoot = path.resolve(__dirname, "..");
const serverPath = path.join(pluginRoot, "mcp", "server.mjs");
const codexHome = process.env.CODEX_HOME || path.join(os.homedir(), ".codex");
const configPath = path.join(codexHome, "config.toml");
const startMarker = "# BEGIN CAPABILITY ROUTER MCP";
const endMarker = "# END CAPABILITY ROUTER MCP";

function tomlLiteral(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function defaultRoots() {
  return [
    "%USERPROFILE%\\.codex",
    "%USERPROFILE%\\.agents",
    process.cwd()
  ].join(path.delimiter);
}

function renderBlock() {
  return [
    startMarker,
    "[mcp_servers.capability-router]",
    `command = ${tomlLiteral(process.execPath)}`,
    `args = [${tomlLiteral(serverPath)}]`,
    `cwd = ${tomlLiteral(pluginRoot)}`,
    "startup_timeout_sec = 30",
    "",
    "[mcp_servers.capability-router.env]",
    `CAPABILITY_ROUTER_ROOTS = ${tomlLiteral(process.env.CAPABILITY_ROUTER_ROOTS || defaultRoots())}`,
    endMarker,
    ""
  ].join("\n");
}

function replaceManagedBlock(content, block) {
  const pattern = new RegExp(`${startMarker}[\\s\\S]*?${endMarker}\\n?`, "m");
  if (pattern.test(content)) return { content: content.replace(pattern, block), changed: true };
  if (/\[mcp_servers\.capability-router\]/.test(content)) {
    console.log(`Capability Router MCP server is already configured in ${configPath}`);
    console.log("Existing unmarked config was left unchanged.");
    return { content, changed: false };
  }
  return { content: `${content.trimEnd()}\n\n${block}`, changed: true };
}

async function main() {
  await mkdir(codexHome, { recursive: true });
  let content = "";
  try {
    content = await readFile(configPath, "utf8");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }

  const result = replaceManagedBlock(content, renderBlock());
  if (result.changed) {
    await writeFile(configPath, result.content, "utf8");
    console.log(`Registered Capability Router MCP server in ${configPath}`);
  }
  console.log("Restart Codex or start a new session so the MCP tool list is rebuilt.");
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
