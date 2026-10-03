/**
 * Wirebox CLI - Client Factory
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { Wirebox } from "@wirebox-sh/sdk";
import type { Command } from "commander";

export const CLI_VERSION = "0.6.0";

export interface GlobalOpts {
  apiKey?: string;
  baseUrl?: string;
  json?: boolean;
}

export function getGlobalOpts(cmd: Command): GlobalOpts {
  let root = cmd;
  while (root.parent) {
    root = root.parent;
  }
  return root.opts() as GlobalOpts;
}

export function readConfigFile(): { apiKey?: string; baseUrl?: string } {
  try {
    const home = process.env.WIREBOX_HOME || os.homedir();
    const configPath = process.env.WIREBOX_CONFIG_PATH || path.join(home, ".wirebox", "config");
    if (!fs.existsSync(configPath)) return {};
    const content = fs.readFileSync(configPath, "utf-8").trim();
    if (content.startsWith("{")) {
      try {
        const parsed = JSON.parse(content);
        return {
          apiKey: (parsed.api_key || parsed.apiKey || "").trim() || undefined,
          baseUrl: (parsed.base_url || parsed.baseUrl || "").trim() || undefined,
        };
      } catch {}
    }
    const out: { apiKey?: string; baseUrl?: string } = {};
    for (const raw of content.split("\n")) {
      const line = raw.trim();
      if (!line || line.startsWith("#") || !line.includes("=")) continue;
      const eq = line.indexOf("=");
      const key = line.slice(0, eq).trim();
      const value = line.slice(eq + 1).trim().replace(/^['"]|['"]$/g, "");
      if (key === "api_key" || key === "apiKey") out.apiKey = value;
      if (key === "base_url" || key === "baseUrl") out.baseUrl = value;
    }
    if (!out.apiKey && content.startsWith("wb_live_")) {
      out.apiKey = content.split("\n")[0].trim();
    }
    return out;
  } catch {
    return {};
  }
}

export function createClient(opts: GlobalOpts): Wirebox {
  const fileCfg = readConfigFile();
  const apiKey = opts.apiKey || process.env.WIREBOX_API_KEY || fileCfg.apiKey;
  const baseUrl = opts.baseUrl || process.env.WIREBOX_BASE_URL || fileCfg.baseUrl;
  return new Wirebox({
    apiKey,
    baseUrl,
  });
}
