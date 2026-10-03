import { describe, it, expect } from "vitest";
import { Command } from "commander";
import { registerWebhookCommands } from "../src/commands/webhook.js";

describe("Webhook CLI Commands", () => {
  it("registers webhook command", () => {
    const program = new Command();
    registerWebhookCommands(program);

    const commandNames = program.commands.map((c) => c.name());
    expect(commandNames).toContain("webhook");
  });

  it("registers all webhook subcommands: list, view, create, update, delete, test, rotate-secret, verify-signature", () => {
    const program = new Command();
    registerWebhookCommands(program);

    const webhookCmd = program.commands.find((c) => c.name() === "webhook");
    expect(webhookCmd).toBeDefined();

    const subNames = webhookCmd!.commands.map((c) => c.name());
    expect(subNames).toContain("list");
    expect(subNames).toContain("view");
    expect(subNames).toContain("create");
    expect(subNames).toContain("update");
    expect(subNames).toContain("delete");
    expect(subNames).toContain("test");
    expect(subNames).toContain("rotate-secret");
    expect(subNames).toContain("verify-signature");
  });

  it("registers view aliases (info, show) and ping alias for test without legacy get/verify", () => {
    const program = new Command();
    registerWebhookCommands(program);

    const webhookCmd = program.commands.find((c) => c.name() === "webhook");
    const viewCmd = webhookCmd!.commands.find((c) => c.name() === "view");
    expect(viewCmd).toBeDefined();
    expect(viewCmd!.aliases()).toContain("info");
    expect(viewCmd!.aliases()).toContain("show");
    expect(viewCmd!.aliases()).not.toContain("get");

    const testCmd = webhookCmd!.commands.find((c) => c.name() === "test");
    expect(testCmd).toBeDefined();
    expect(testCmd!.aliases()).toContain("ping");

    const verifyCmd = webhookCmd!.commands.find((c) => c.name() === "verify-signature");
    expect(verifyCmd).toBeDefined();
    expect(verifyCmd!.aliases()).toContain("check-signature");
    expect(verifyCmd!.aliases()).not.toContain("verify");
  });

  it("registers appropriate options for webhook create and list", () => {
    const program = new Command();
    registerWebhookCommands(program);

    const webhookCmd = program.commands.find((c) => c.name() === "webhook");
    const createCmd = webhookCmd!.commands.find((c) => c.name() === "create");
    const createOptNames = createCmd!.options.map((o) => o.name());
    expect(createOptNames).toContain("url");
    expect(createOptNames).toContain("events");
    expect(createOptNames).toContain("agent");
    expect(createOptNames).toContain("mailbox");
    expect(createOptNames).toContain("auth-token");

    const listCmd = webhookCmd!.commands.find((c) => c.name() === "list");
    const listOptNames = listCmd!.options.map((o) => o.name());
    expect(listOptNames).toContain("agent");
    expect(listOptNames).toContain("mailbox");
    expect(listOptNames).toContain("event");
    expect(listOptNames).toContain("limit");
    expect(listOptNames).toContain("offset");
  });

  it("registers appropriate options for webhook verify-signature", () => {
    const program = new Command();
    registerWebhookCommands(program);

    const webhookCmd = program.commands.find((c) => c.name() === "webhook");
    const verifyCmd = webhookCmd!.commands.find((c) => c.name() === "verify-signature");
    const verifyOptNames = verifyCmd!.options.map((o) => o.name());
    expect(verifyOptNames).toContain("payload");
    expect(verifyOptNames).toContain("payload-file");
    expect(verifyOptNames).toContain("signature");
    expect(verifyOptNames).toContain("secret");
    expect(verifyOptNames).toContain("timestamp");
    expect(verifyOptNames).toContain("tolerance");
  });
});
