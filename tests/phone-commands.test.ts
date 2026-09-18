import { describe, it, expect, vi, beforeEach } from "vitest";
import { Command } from "commander";
import { registerPhoneCommands } from "../src/commands/phone.js";

describe("Phone CLI Commands", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  const mockNumber = {
    id: "pn_01J8DEF123456789",
    phone_number: "+14155552671",
    country_code: "US",
    type: "local",
    region: "CA",
    agent_handle: "support-bot",
    agent_identity_id: "agt_01J8ABC123456789",
    status: "active",
    sms_status: "ready",
    sms_error_code: null,
    sms_error_detail: null,
    sms_ready_at: "2026-09-18T10:00:00Z",
    capabilities: {
      sms: true,
      mms: true,
      voice: true,
    },
    created_at: "2026-09-18T10:00:00Z",
    updated_at: "2026-09-18T10:00:00Z",
  };

  const mockMessage = {
    id: "msg_01J8SMS123456789",
    phone_number: "+14155552671",
    agent_handle: "support-bot",
    direction: "inbound",
    type: "sms",
    from_number: "+15559876543",
    to_numbers: ["+14155552671"],
    text: "Hello, order status please",
    media: null,
    is_read: false,
    segments: 1,
    created_at: "2026-09-18T10:05:00Z",
  };

  it("registers phone command and all subcommands on program", () => {
    const program = new Command();
    registerPhoneCommands(program);

    const phoneCmd = program.commands.find((c) => c.name() === "phone");
    expect(phoneCmd).toBeDefined();

    const subNames = phoneCmd!.commands.map((c) => c.name());
    expect(subNames).toContain("provision");
    expect(subNames).toContain("list");
    expect(subNames).toContain("get");
    expect(subNames).toContain("release");
    expect(subNames).toContain("messages");
    expect(subNames).toContain("message");
    expect(subNames).toContain("mark-read");
  });

  it("provision command provisions a phone number", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      status: 201,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => mockNumber,
    } as Response);

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const program = new Command()
      .option("--api-key <key>")
      .option("--json", "", false);
    registerPhoneCommands(program);

    await program.parseAsync([
      "node",
      "wirebox",
      "--api-key",
      "wb_live_test",
      "phone",
      "provision",
      "--agent",
      "support-bot",
      "--region",
      "CA",
    ]);

    expect(fetchSpy).toHaveBeenCalledWith(
      "https://api.wirebox.sh/v1/phone/numbers",
      expect.objectContaining({
        method: "POST",
      })
    );
    const callArgs = fetchSpy.mock.calls[0];
    const sentBody = JSON.parse(callArgs[1]?.body as string);
    expect(sentBody).toEqual({
      agent_handle: "support-bot",
      type: "local",
      region: "CA",
      country_code: "US",
    });
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("+14155552671"));
  });

  it("list command lists phone numbers", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => ({
        numbers: [mockNumber],
        next_cursor: null,
        has_more: false,
      }),
    } as Response);

    vi.spyOn(console, "log").mockImplementation(() => {});

    const program = new Command()
      .option("--api-key <key>")
      .option("--json", "", false);
    registerPhoneCommands(program);

    await program.parseAsync([
      "node",
      "wirebox",
      "--api-key",
      "wb_live_test",
      "phone",
      "list",
      "--status",
      "active",
    ]);

    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining("https://api.wirebox.sh/v1/phone/numbers?"),
      expect.objectContaining({ method: "GET" })
    );
  });

  it("get command retrieves phone number details", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => mockNumber,
    } as Response);

    vi.spyOn(console, "log").mockImplementation(() => {});

    const program = new Command()
      .option("--api-key <key>")
      .option("--json", "", false);
    registerPhoneCommands(program);

    await program.parseAsync([
      "node",
      "wirebox",
      "--api-key",
      "wb_live_test",
      "phone",
      "get",
      "+14155552671",
    ]);

    expect(fetchSpy).toHaveBeenCalledWith(
      "https://api.wirebox.sh/v1/phone/numbers/%2B14155552671",
      expect.objectContaining({ method: "GET" })
    );
  });

  it("release command releases phone number", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      status: 204,
      headers: new Headers(),
      text: async () => "",
    } as Response);

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const program = new Command()
      .option("--api-key <key>")
      .option("--json", "", false);
    registerPhoneCommands(program);

    await program.parseAsync([
      "node",
      "wirebox",
      "--api-key",
      "wb_live_test",
      "phone",
      "release",
      "+14155552671",
    ]);

    expect(fetchSpy).toHaveBeenCalledWith(
      "https://api.wirebox.sh/v1/phone/numbers/%2B14155552671",
      expect.objectContaining({ method: "DELETE" })
    );
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("Released phone number"));
  });

  it("messages command lists SMS/MMS messages", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => ({
        messages: [mockMessage],
        next_cursor: null,
        has_more: false,
      }),
    } as Response);

    vi.spyOn(console, "log").mockImplementation(() => {});

    const program = new Command()
      .option("--api-key <key>")
      .option("--json", "", false);
    registerPhoneCommands(program);

    await program.parseAsync([
      "node",
      "wirebox",
      "--api-key",
      "wb_live_test",
      "phone",
      "messages",
      "support-bot",
      "--unread-only",
    ]);

    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining("https://api.wirebox.sh/v1/phone/numbers/support-bot/messages?"),
      expect.objectContaining({ method: "GET" })
    );
  });

  it("message command retrieves message details and media", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => mockMessage,
    } as Response);

    vi.spyOn(console, "log").mockImplementation(() => {});

    const program = new Command()
      .option("--api-key <key>")
      .option("--json", "", false);
    registerPhoneCommands(program);

    await program.parseAsync([
      "node",
      "wirebox",
      "--api-key",
      "wb_live_test",
      "phone",
      "message",
      "support-bot",
      "msg_01J8SMS123456789",
    ]);

    expect(fetchSpy).toHaveBeenCalledWith(
      "https://api.wirebox.sh/v1/phone/numbers/support-bot/messages/msg_01J8SMS123456789",
      expect.objectContaining({ method: "GET" })
    );
  });

  it("mark-read command marks message as read", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => ({ ...mockMessage, is_read: true }),
    } as Response);

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const program = new Command()
      .option("--api-key <key>")
      .option("--json", "", false);
    registerPhoneCommands(program);

    await program.parseAsync([
      "node",
      "wirebox",
      "--api-key",
      "wb_live_test",
      "phone",
      "mark-read",
      "support-bot",
      "msg_01J8SMS123456789",
    ]);

    expect(fetchSpy).toHaveBeenCalledWith(
      "https://api.wirebox.sh/v1/phone/numbers/support-bot/messages/msg_01J8SMS123456789",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ is_read: true }),
      })
    );
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("Marked message 'msg_01J8SMS123456789' as read"));
  });
});
