import { describe, it, expect } from "vitest";
import { Command } from "commander";
import { registerWhoamiCommand } from "../src/commands/whoami.js";
import { registerSignupCommands } from "../src/commands/signup.js";
import { registerIdentityCommands } from "../src/commands/identity.js";
import { registerMailCommands } from "../src/commands/mail.js";

describe("CLI Command Registration", () => {
  it("registers all core commands and aliases on program", () => {
    const program = new Command();
    registerWhoamiCommand(program);
    registerSignupCommands(program);
    registerIdentityCommands(program);
    registerMailCommands(program);

    const commandNames = program.commands.map((c) => c.name());
    expect(commandNames).toContain("whoami");
    expect(commandNames).toContain("me");
    expect(commandNames).toContain("signup");
    expect(commandNames).toContain("verify");
    expect(commandNames).toContain("identity");
    expect(commandNames).toContain("id");
    expect(commandNames).toContain("mail");
  });

  it("registers identity subcommands correctly", () => {
    const program = new Command();
    registerIdentityCommands(program);

    const identityCmd = program.commands.find((c) => c.name() === "identity");
    expect(identityCmd).toBeDefined();

    const subNames = identityCmd!.commands.map((c) => c.name());
    expect(subNames).toContain("create");
    expect(subNames).toContain("list");
    expect(subNames).toContain("get");
    expect(subNames).toContain("update");
    expect(subNames).toContain("delete");
  });

  it("registers mail subcommands correctly", () => {
    const program = new Command();
    registerMailCommands(program);

    const mailCmd = program.commands.find((c) => c.name() === "mail");
    expect(mailCmd).toBeDefined();

    const subNames = mailCmd!.commands.map((c) => c.name());
    expect(subNames).toContain("send");
    expect(subNames).toContain("list");
    expect(subNames).toContain("get");
    expect(subNames).toContain("reply");
    expect(subNames).toContain("delete");
  });
});
