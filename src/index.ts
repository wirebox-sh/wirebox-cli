#!/usr/bin/env node

import { Command } from "commander";
import { CLI_VERSION } from "./client.js";
import { registerIdentityCommands } from "./commands/identity.js";
import { registerIMessageCommands } from "./commands/imessage.js";
import { registerMailCommands } from "./commands/mail.js";
import { registerSignupCommands } from "./commands/signup.js";
import { registerTunnelCommands } from "./commands/tunnel.js";
import { registerWebhookCommands } from "./commands/webhook.js";
import { registerWhoamiCommand } from "./commands/whoami.js";

const program = new Command()
  .name("wirebox")
  .description("Official CLI for Wirebox — Real-world identity and communication layer for AI agents")
  .version(CLI_VERSION)
  .option("--api-key <key>", "Wirebox API key (or set WIREBOX_API_KEY)")
  .option("--base-url <url>", "Override API base URL (or set WIREBOX_BASE_URL)")
  .option("--json", "Output response in raw JSON format for scripts and agents", false);

registerWhoamiCommand(program);
registerSignupCommands(program);
registerIdentityCommands(program);
registerMailCommands(program);
registerIMessageCommands(program);
registerTunnelCommands(program);
registerWebhookCommands(program);

program.parse();
