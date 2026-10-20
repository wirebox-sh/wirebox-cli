import { describe, it, expect, vi, beforeEach } from "vitest";
import { Command } from "commander";
import { registerA2ACommands } from "../src/commands/a2a.js";

describe("A2A CLI Commands", () => {
  it("registers a2a command", () => {
    const program = new Command();
    registerA2ACommands(program);

    const commandNames = program.commands.map((c) => c.name());
    expect(commandNames).toContain("a2a");
  });

  it("registers all 13 A2A subcommands", () => {
    const program = new Command();
    registerA2ACommands(program);

    const a2aCmd = program.commands.find((c) => c.name() === "a2a");
    expect(a2aCmd).toBeDefined();

    const subNames = a2aCmd!.commands.map((c) => c.name());

    // 1. Calling & Execution
    expect(subNames).toContain("run");
    expect(subNames).toContain("call");
    expect(subNames).toContain("watch");
    expect(subNames).toContain("cancel");

    // 2. Ledger Queries
    expect(subNames).toContain("tasks");
    expect(subNames).toContain("task");

    // 3. Worker Transitions & Replies
    expect(subNames).toContain("progress");
    expect(subNames).toContain("complete");
    expect(subNames).toContain("ask");
    expect(subNames).toContain("fail");
    expect(subNames).toContain("reply");

    // 4. Cards & Settings
    expect(subNames).toContain("card");
    expect(subNames).toContain("settings");
  });

  it("registers options for calling commands: run, call, watch, cancel", () => {
    const program = new Command();
    registerA2ACommands(program);

    const a2aCmd = program.commands.find((c) => c.name() === "a2a")!;

    const runCmd = a2aCmd.commands.find((c) => c.name() === "run")!;
    const runOpts = runCmd.options.map((o) => o.name());
    expect(runOpts).toContain("identity");
    expect(runOpts).toContain("context");
    expect(runOpts).toContain("credential");
    expect(runOpts).toContain("no-stream");
    expect(runOpts).toContain("timeout");

    const callCmd = a2aCmd.commands.find((c) => c.name() === "call")!;
    const callOpts = callCmd.options.map((o) => o.name());
    expect(callOpts).toContain("identity");
    expect(callOpts).toContain("context");
    expect(callOpts).toContain("credential");

    const watchCmd = a2aCmd.commands.find((c) => c.name() === "watch")!;
    const watchOpts = watchCmd.options.map((o) => o.name());
    expect(watchOpts).toContain("identity");
    expect(watchOpts).toContain("target");
    expect(watchOpts).toContain("timeout");

    const cancelCmd = a2aCmd.commands.find((c) => c.name() === "cancel")!;
    const cancelOpts = cancelCmd.options.map((o) => o.name());
    expect(cancelOpts).toContain("identity");
    expect(cancelOpts).toContain("reason");
  });

  it("registers options for ledger queries: tasks and task", () => {
    const program = new Command();
    registerA2ACommands(program);

    const a2aCmd = program.commands.find((c) => c.name() === "a2a")!;

    const tasksCmd = a2aCmd.commands.find((c) => c.name() === "tasks")!;
    const tasksOpts = tasksCmd.options.map((o) => o.name());
    expect(tasksOpts).toContain("identity");
    expect(tasksOpts).toContain("sent");
    expect(tasksOpts).toContain("state");
    expect(tasksOpts).toContain("context");
    expect(tasksOpts).toContain("limit");

    const taskCmd = a2aCmd.commands.find((c) => c.name() === "task")!;
    const taskOpts = taskCmd.options.map((o) => o.name());
    expect(taskOpts).toContain("identity");
  });

  it("registers options for worker reply commands: progress, complete, ask, fail, reply", () => {
    const program = new Command();
    registerA2ACommands(program);

    const a2aCmd = program.commands.find((c) => c.name() === "a2a")!;

    const progressCmd = a2aCmd.commands.find((c) => c.name() === "progress")!;
    expect(progressCmd.options.map((o) => o.name())).toContain("identity");

    const completeCmd = a2aCmd.commands.find((c) => c.name() === "complete")!;
    const completeOpts = completeCmd.options.map((o) => o.name());
    expect(completeOpts).toContain("identity");
    expect(completeOpts).toContain("artifact");

    const askCmd = a2aCmd.commands.find((c) => c.name() === "ask")!;
    expect(askCmd.options.map((o) => o.name())).toContain("identity");

    const failCmd = a2aCmd.commands.find((c) => c.name() === "fail")!;
    expect(failCmd.options.map((o) => o.name())).toContain("identity");

    const replyCmd = a2aCmd.commands.find((c) => c.name() === "reply")!;
    const replyOpts = replyCmd.options.map((o) => o.name());
    expect(replyOpts).toContain("identity");
    expect(replyOpts).toContain("intent");
    expect(replyOpts).toContain("text");
  });

  it("registers options for card and settings commands", () => {
    const program = new Command();
    registerA2ACommands(program);

    const a2aCmd = program.commands.find((c) => c.name() === "a2a")!;

    const cardCmd = a2aCmd.commands.find((c) => c.name() === "card")!;
    expect(cardCmd.options.map((o) => o.name())).toContain("identity");

    const settingsCmd = a2aCmd.commands.find((c) => c.name() === "settings")!;
    const settingsOpts = settingsCmd.options.map((o) => o.name());
    expect(settingsOpts).toContain("identity");
    expect(settingsOpts).toContain("enable");
    expect(settingsOpts).toContain("disable");
    expect(settingsOpts).toContain("skills-file");
  });
});
