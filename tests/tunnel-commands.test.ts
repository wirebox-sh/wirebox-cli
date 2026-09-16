import { describe, it, expect } from "vitest";
import { Command } from "commander";
import { registerTunnelCommands } from "../src/commands/tunnel.js";

describe("Tunnel CLI Commands", () => {
  it("registers tunnel command and its alias tun", () => {
    const program = new Command();
    registerTunnelCommands(program);

    const commandNames = program.commands.map((c) => c.name());
    expect(commandNames).toContain("tunnel");
    expect(commandNames).toContain("tun");
  });

  it("registers all tunnel subcommands: list, get, update, connect, forward", () => {
    const program = new Command();
    registerTunnelCommands(program);

    const tunnelCmd = program.commands.find((c) => c.name() === "tunnel");
    expect(tunnelCmd).toBeDefined();

    const subNames = tunnelCmd!.commands.map((c) => c.name());
    expect(subNames).toContain("list");
    expect(subNames).toContain("get");
    expect(subNames).toContain("update");
    expect(subNames).toContain("connect");
    expect(subNames).toContain("forward");
  });
});
