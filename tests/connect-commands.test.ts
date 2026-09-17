import { describe, it, expect } from "vitest";
import { Command } from "commander";
import { registerConnectCommands } from "../src/commands/connect.js";

describe("Connect CLI Commands", () => {
  it("registers connect command with expected options", () => {
    const program = new Command();
    registerConnectCommands(program);

    const connectCmd = program.commands.find((c) => c.name() === "connect");
    expect(connectCmd).toBeDefined();

    const optionNames = connectCmd!.options.map((o) => o.long);
    expect(optionNames).toContain("--identity");
    expect(optionNames).toContain("--driver");
    expect(optionNames).toContain("--harness");
    expect(optionNames).toContain("--dir");
    expect(optionNames).toContain("--domain");
  });

  it("registers all connect subcommands: start, init, doctor, drivers, demo, daemon", () => {
    const program = new Command();
    registerConnectCommands(program);

    const connectCmd = program.commands.find((c) => c.name() === "connect");
    expect(connectCmd).toBeDefined();

    const subNames = connectCmd!.commands.map((c) => c.name());
    expect(subNames).toContain("start");
    expect(subNames).toContain("init");
    expect(subNames).toContain("doctor");
    expect(subNames).toContain("drivers");
    expect(subNames).toContain("demo");
    expect(subNames).toContain("daemon");

    const daemonCmd = connectCmd!.commands.find((c) => c.name() === "daemon");
    expect(daemonCmd).toBeDefined();
    const daemonSubNames = daemonCmd!.commands.map((c) => c.name());
    expect(daemonSubNames).toContain("install");
    expect(daemonSubNames).toContain("uninstall");
    expect(daemonSubNames).toContain("status");
    expect(daemonSubNames).toContain("logs");
  });
});
