/**
 * Wirebox CLI - Client Factory
 */

import { Wirebox } from "@wirebox-sh/sdk";
import type { Command } from "commander";

export const CLI_VERSION = "0.2.2";

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

export function createClient(opts: GlobalOpts): Wirebox {
  return new Wirebox({
    apiKey: opts.apiKey,
    baseUrl: opts.baseUrl,
  });
}
