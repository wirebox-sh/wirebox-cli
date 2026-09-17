import { globalDriverRegistry } from "./drivers/base.js";
import { ClaudeCodeDriver } from "./drivers/claude-code.js";
import { CodexDriver } from "./drivers/codex.js";
import { HermesDriver } from "./drivers/hermes.js";
import { OpenCodeDriver } from "./drivers/opencode.js";

// Auto-register official built-in drivers
globalDriverRegistry.register(new ClaudeCodeDriver());
globalDriverRegistry.register(new CodexDriver());
globalDriverRegistry.register(new HermesDriver());
globalDriverRegistry.register(new OpenCodeDriver());

export * from "./types.js";
export * from "./core/prompts.js";
export * from "./core/escalation.js";
export * from "./core/session-manager.js";
export * from "./core/webhook.js";
export * from "./core/tunnel.js";
export * from "./core/connect.js";
export * from "./drivers/base.js";
export * from "./drivers/claude-code.js";
export * from "./drivers/codex.js";
export * from "./drivers/hermes.js";
export * from "./drivers/opencode.js";
export * from "./daemon/launchd.js";
export * from "./ui/doctor.js";
export * from "./ui/wizard.js";
