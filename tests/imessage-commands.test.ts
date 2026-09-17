import { describe, it, expect, vi, beforeEach } from "vitest";
import { Command } from "commander";
import { registerIMessageCommands } from "../src/commands/imessage.js";

describe("iMessage CLI Commands", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("registers imessage command and all subcommands on program", () => {
    const program = new Command();
    registerIMessageCommands(program);

    const imessageCmd = program.commands.find((c) => c.name() === "imessage");
    expect(imessageCmd).toBeDefined();

    const subNames = imessageCmd!.commands.map((c) => c.name());
    expect(subNames).toContain("router");
    expect(subNames).toContain("conversations");
    expect(subNames).toContain("disconnect");
    expect(subNames).toContain("messages");
    expect(subNames).toContain("send");
    expect(subNames).not.toContain("users");
  });

  it("router command fetches and outputs router details", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => ({
        router_number: "+16282649335",
        agent_handle: "sale-mark",
        connect_command: "connect @sale-mark",
        qr_uri: "sms:+16282649335&body=connect%20%40sale-mark",
        status: "online",
      }),
    } as Response);

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const program = new Command()
      .option("--api-key <key>")
      .option("--json", "", false);
    registerIMessageCommands(program);

    await program.parseAsync([
      "node",
      "wirebox",
      "--api-key",
      "wb_live_test",
      "imessage",
      "router",
      "sale-mark",
    ]);

    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining("/v1/imessage/router"),
      expect.objectContaining({ method: "GET" })
    );

    const loggedOutput = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(loggedOutput).toContain("+16282649335");
    expect(loggedOutput).toContain("@sale-mark");
    expect(loggedOutput).toContain("connect @sale-mark");
  });

  it("router command outputs raw json when --json is passed", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => ({
        router_number: "+16282649335",
        agent_handle: "sale-mark",
        connect_command: "connect @sale-mark",
        qr_uri: "sms:+16282649335&body=connect%20%40sale-mark",
        status: "online",
      }),
    } as Response);

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const program = new Command()
      .option("--api-key <key>")
      .option("--json", "", false);
    registerIMessageCommands(program);

    await program.parseAsync([
      "node",
      "wirebox",
      "--api-key",
      "wb_live_test",
      "--json",
      "imessage",
      "router",
      "sale-mark",
    ]);

    const loggedOutput = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    const parsed = JSON.parse(loggedOutput);
    expect(parsed.router_number).toBe("+16282649335");
    expect(parsed.qr_uri).toContain("sms:+16282649335");
  });

  it("conversations command lists active conversations", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => ({
        data: [
          {
            id: "conv_01j999888777",
            identity_id: "agt_123",
            user_phone: "+16465550123",
            status: "connected",
            unread_count: 0,
            last_message: { text: "Hello", has_media: false, created_at: "2026-09-17T02:00:00Z" },
            updated_at: "2026-09-17T02:00:00Z",
          },
        ],
        next_cursor: null,
        has_more: false,
      }),
    } as Response);

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const program = new Command()
      .option("--api-key <key>")
      .option("--json", "", false);
    registerIMessageCommands(program);

    await program.parseAsync([
      "node",
      "wirebox",
      "--api-key",
      "wb_live_test",
      "imessage",
      "conversations",
    ]);

    const loggedOutput = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(loggedOutput).toContain("conv_01j999888777");
    expect(loggedOutput).toContain("+16465550123");
    expect(loggedOutput).toContain("connected");
  });

  it("send command delivers outbound message", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      status: 201,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => ({
        id: "msg_out001",
        conversation_id: "conv_01j999888777",
        identity_id: "agt_123",
        direction: "outbound",
        to: "+16465550123",
        text: "Hi from test",
        media_url: null,
        status: "sent",
        created_at: "2026-09-17T02:01:00Z",
      }),
    } as Response);

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const program = new Command()
      .option("--api-key <key>")
      .option("--json", "", false);
    registerIMessageCommands(program);

    await program.parseAsync([
      "node",
      "wirebox",
      "--api-key",
      "wb_live_test",
      "--json",
      "imessage",
      "send",
      "-c",
      "conv_01j999888777",
      "-m",
      "Hi from test",
    ]);

    const loggedOutput = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    const parsed = JSON.parse(loggedOutput);
    expect(parsed.id).toBe("msg_out001");
    expect(parsed.status).toBe("sent");
  });

  it("messages command displays chat timeline format", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => ({
        data: [
          {
            id: "msg_in_1",
            conversation_id: "conv_01j999888777",
            identity_id: "agt_123",
            direction: "inbound",
            sender: "+16465550123",
            text: "Hello, agent!",
            media_url: null,
            created_at: "2026-09-17T02:00:00Z",
          },
          {
            id: "msg_out_2",
            conversation_id: "conv_01j999888777",
            identity_id: "agt_123",
            direction: "outbound",
            sender: "agent",
            text: "Hello! How can I help you?",
            media_url: null,
            created_at: "2026-09-17T02:00:05Z",
          },
        ],
        next_cursor: null,
        has_more: false,
      }),
    } as Response);

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const program = new Command()
      .option("--api-key <key>")
      .option("--json", "", false);
    registerIMessageCommands(program);

    await program.parseAsync([
      "node",
      "wirebox",
      "--api-key",
      "wb_live_test",
      "imessage",
      "messages",
      "conv_01j999888777",
    ]);

    const loggedOutput = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(loggedOutput).toContain("👤 +16465550123:");
    expect(loggedOutput).toContain("Hello, agent!");
    expect(loggedOutput).toContain("🤖 Agent:");
    expect(loggedOutput).toContain("Hello! How can I help you?");
  });
});
