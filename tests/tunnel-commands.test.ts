import { describe, it, expect } from "vitest";
import { Command } from "commander";
import { registerTunnelCommands } from "../src/commands/tunnel.js";

describe("Tunnel CLI Commands", () => {
  it("registers tunnel command", () => {
    const program = new Command();
    registerTunnelCommands(program);

    const commandNames = program.commands.map((c) => c.name());
    expect(commandNames).toContain("tunnel");
  });

  it("registers all tunnel subcommands and aliases: list, status (info, get, view), update, connect, forward", () => {
    const program = new Command();
    registerTunnelCommands(program);

    const tunnelCmd = program.commands.find((c) => c.name() === "tunnel");
    expect(tunnelCmd).toBeDefined();

    const allNames = tunnelCmd!.commands.flatMap((c) => [c.name(), ...c.aliases()]);
    expect(allNames).toContain("list");
    expect(allNames).toContain("status");
    expect(allNames).toContain("get");
    expect(allNames).toContain("info");
    expect(allNames).toContain("view");
    expect(allNames).toContain("update");
    expect(allNames).toContain("connect");
    expect(allNames).toContain("forward");
  });
});
