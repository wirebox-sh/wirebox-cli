import { describe, expect, it } from "vitest";
import { DriverRegistry } from "../src/connect/drivers/base.js";
import { ClaudeCodeDriver } from "../src/connect/drivers/claude-code.js";
import { CodexDriver } from "../src/connect/drivers/codex.js";
import { HermesDriver } from "../src/connect/drivers/hermes.js";
import { OpenCodeDriver } from "../src/connect/drivers/opencode.js";

describe("Agent Drivers & Registry", () => {
  it("registers and retrieves Claude Code, Codex, Hermes, and OpenCode drivers", () => {
    const registry = new DriverRegistry();
    const claudeDriver = new ClaudeCodeDriver();
    const codexDriver = new CodexDriver();
    const hermesDriver = new HermesDriver();
    const opencodeDriver = new OpenCodeDriver();

    registry.register(claudeDriver);
    registry.register(codexDriver);
    registry.register(hermesDriver);
    registry.register(opencodeDriver);

    expect(registry.get("claude-code")).toBe(claudeDriver);
    expect(registry.get("CLAUDE-CODE")).toBe(claudeDriver);
    expect(registry.get("codex")).toBe(codexDriver);
    expect(registry.get("CODEX")).toBe(codexDriver);
    expect(registry.get("hermes")).toBe(hermesDriver);
    expect(registry.get("HERMES")).toBe(hermesDriver);
    expect(registry.get("opencode")).toBe(opencodeDriver);
    expect(registry.get("OPENCODE")).toBe(opencodeDriver);
    expect(registry.get("unknown")).toBeUndefined();

    const all = registry.list();
    expect(all.length).toBe(4);
    expect(all.map((d) => d.name)).toEqual(["claude-code", "codex", "hermes", "opencode"]);
  });

  it("checks availability without crashing", async () => {
    const registry = new DriverRegistry();
    registry.register(new ClaudeCodeDriver());
    registry.register(new CodexDriver());
    registry.register(new HermesDriver());
    registry.register(new OpenCodeDriver());

    const detected = await registry.detectAvailable();
    expect(detected.length).toBe(4);

    for (const item of detected) {
      expect(typeof item.status.available).toBe("boolean");
      if (!item.status.available) {
        expect(item.status.reason).toBeDefined();
      }
    }
  });
});
