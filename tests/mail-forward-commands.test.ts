import { describe, it, expect, vi, beforeEach } from "vitest";
import { Command } from "commander";
import { registerMailCommands } from "../src/commands/mail.js";

describe("Mail Forward CLI Command", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  const mockIdentity = {
    id: "agt_01J8ABC123456789",
    agent_handle: "alice",
    display_name: "Alice",
    mailbox: {
      id: "mbx_01J8DEF123456789",
      email_address: "alice@wirebox.sh",
    },
    mailboxes: [
      {
        id: "mbx_01J8DEF123456789",
        email_address: "alice@wirebox.sh",
        created_at: "2026-09-18T10:00:00Z",
      },
    ],
  };

  function setupProgram() {
    const program = new Command()
      .option("--api-key <key>")
      .option("--json", "", false);
    registerMailCommands(program);
    return program;
  }

  function mockFetchSequences(responses: Array<{ status?: number; data?: any }>) {
    let callIndex = 0;
    return vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      const respDef = responses[callIndex++] || responses[responses.length - 1];
      const status = respDef.status ?? 200;
      return {
        ok: status >= 200 && status < 300,
        status,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => respDef.data ?? {},
      } as Response;
    });
  }

  it("forwards email with default options (retains attachments)", async () => {
    const fetchSpy = mockFetchSequences([
      { data: mockIdentity }, // getIdentity
      {
        data: {
          id: "msg_fwd_01J8DEF",
          thread_id: "thd_new_01J8DEF",
          status: "sent",
        },
      },
    ]);

    const program = setupProgram();
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await program.parseAsync([
      "node",
      "wirebox",
      "--api-key",
      "wb_test_key",
      "mail",
      "forward",
      "msg_orig_123",
      "--identity",
      "alice",
      "--to",
      "bob@example.com",
    ]);

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    const forwardCall = fetchSpy.mock.calls[1];
    expect(forwardCall![0]).toBe("https://api.wirebox.sh/v1/mailboxes/alice%40wirebox.sh/messages/msg_orig_123/forward");
    const reqBody = JSON.parse(forwardCall![1]?.body as string);
    expect(reqBody.to).toEqual(["bob@example.com"]);
    expect(reqBody.forward_attachments).toBe(true);
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("Email forwarded successfully:"));
  });

  it("forwards email with --no-attachments and --comment note", async () => {
    const fetchSpy = mockFetchSequences([
      { data: mockIdentity },
      {
        data: {
          id: "msg_fwd_01J8DEF",
          thread_id: "thd_new_01J8DEF",
          status: "sent",
        },
      },
    ]);

    const program = setupProgram();
    vi.spyOn(console, "log").mockImplementation(() => {});

    await program.parseAsync([
      "node",
      "wirebox",
      "--api-key",
      "wb_test_key",
      "mail",
      "forward",
      "msg_orig_123",
      "--identity",
      "alice",
      "--to",
      "bob@example.com, carol@example.com",
      "--comment",
      "Please review the attached invoice",
      "--no-attachments",
    ]);

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    const forwardCall = fetchSpy.mock.calls[1];
    const reqBody = JSON.parse(forwardCall![1]?.body as string);
    expect(reqBody.to).toEqual(["bob@example.com", "carol@example.com"]);
    expect(reqBody.body_text).toBe("Please review the attached invoice");
    expect(reqBody.forward_attachments).toBe(false);
  });

  it("outputs JSON when --json flag is provided", async () => {
    mockFetchSequences([
      { data: mockIdentity },
      {
        data: {
          id: "msg_fwd_01J8DEF",
          thread_id: "thd_new_01J8DEF",
          status: "sent",
        },
      },
    ]);

    const program = setupProgram();
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await program.parseAsync([
      "node",
      "wirebox",
      "--api-key",
      "wb_test_key",
      "--json",
      "mail",
      "forward",
      "msg_orig_123",
      "--identity",
      "alice",
      "--to",
      "bob@example.com",
    ]);

    expect(logSpy).toHaveBeenCalledWith(
      JSON.stringify(
        {
          id: "msg_fwd_01J8DEF",
          thread_id: "thd_new_01J8DEF",
          status: "sent",
        },
        null,
        2
      )
    );
  });
});
