import { describe, it, expect, vi, beforeEach } from "vitest";
import { Command } from "commander";
import { registerMailCommands } from "../src/commands/mail.js";

describe("Mail Draft CLI Commands", () => {
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

  const mockDraft = {
    id: "dft_01J8TEST123456789",
    mailbox_id: "mbx_01J8DEF123456789",
    agent_identity_id: "agt_01J8ABC123456789",
    subject: "Q3 Report",
    to: ["boss@example.com"],
    cc: ["team@example.com"],
    bcc: [],
    body_text: "Here is the summary.",
    body_html: "<p>Here is the summary.</p>",
    reply_to_message_id: null,
    forward_message_id: null,
    thread_id: null,
    version: 1,
    attachments: [
      {
        id: "att_dft_01J8TEST1",
        draft_id: "dft_01J8TEST123456789",
        filename: "report.pdf",
        content_type: "application/pdf",
        byte_size: 1024,
        source_media_id: null,
        created_at: "2026-10-06T12:00:00Z",
      },
    ],
    created_at: "2026-10-06T12:00:00Z",
    updated_at: "2026-10-06T12:00:00Z",
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

  it("lists drafts", async () => {
    const fetchSpy = mockFetchSequences([
      { data: mockIdentity },
      { data: { drafts: [mockDraft], total: 1, limit: 50, offset: 0 } },
    ]);

    const program = setupProgram();
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await program.parseAsync([
      "node",
      "wirebox",
      "--api-key",
      "wb_test_key",
      "mail",
      "draft",
      "list",
      "-i",
      "alice",
    ]);

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(fetchSpy.mock.calls[1]![0]).toBe("https://api.wirebox.sh/v1/mailboxes/alice%40wirebox.sh/drafts?limit=50&offset=0");
    expect(logSpy).toHaveBeenCalled();
  });

  it("gets a draft by id", async () => {
    const fetchSpy = mockFetchSequences([
      { data: mockIdentity },
      { data: mockDraft },
    ]);

    const program = setupProgram();
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await program.parseAsync([
      "node",
      "wirebox",
      "--api-key",
      "wb_test_key",
      "mail",
      "draft",
      "get",
      "dft_01J8TEST123456789",
      "-i",
      "alice",
    ]);

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(fetchSpy.mock.calls[1]![0]).toBe(
      "https://api.wirebox.sh/v1/mailboxes/alice%40wirebox.sh/drafts/dft_01J8TEST123456789"
    );
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("Draft Details"));
  });

  it("creates a draft", async () => {
    const fetchSpy = mockFetchSequences([
      { data: mockIdentity },
      { data: mockDraft },
    ]);

    const program = setupProgram();
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await program.parseAsync([
      "node",
      "wirebox",
      "--api-key",
      "wb_test_key",
      "mail",
      "draft",
      "create",
      "-i",
      "alice",
      "--to",
      "boss@example.com",
      "--subject",
      "Q3 Report",
      "--text",
      "Here is the summary.",
    ]);

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    const postCall = fetchSpy.mock.calls[1]!;
    expect(postCall[0]).toBe("https://api.wirebox.sh/v1/mailboxes/alice%40wirebox.sh/drafts");
    const body = JSON.parse(postCall[1]?.body as string);
    expect(body.to).toEqual(["boss@example.com"]);
    expect(body.subject).toBe("Q3 Report");
    expect(body.text).toBe("Here is the summary.");
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("Draft created successfully:"));
  });

  it("updates a draft", async () => {
    const updatedDraft = { ...mockDraft, subject: "Updated Subject", version: 2 };
    const fetchSpy = mockFetchSequences([
      { data: mockIdentity },
      { data: updatedDraft },
    ]);

    const program = setupProgram();
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await program.parseAsync([
      "node",
      "wirebox",
      "--api-key",
      "wb_test_key",
      "mail",
      "draft",
      "update",
      "dft_01J8TEST123456789",
      "-i",
      "alice",
      "--subject",
      "Updated Subject",
      "--expected-version",
      "1",
    ]);

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    const patchCall = fetchSpy.mock.calls[1]!;
    expect(patchCall[0]).toBe(
      "https://api.wirebox.sh/v1/mailboxes/alice%40wirebox.sh/drafts/dft_01J8TEST123456789"
    );
    expect(patchCall[1]?.method).toBe("PATCH");
    const body = JSON.parse(patchCall[1]?.body as string);
    expect(body.subject).toBe("Updated Subject");
    expect(body.version).toBe(1);
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("updated successfully:"));
  });

  it("sends a draft", async () => {
    const fetchSpy = mockFetchSequences([
      { data: mockIdentity },
      {
        data: {
          draft_id: "dft_01J8TEST123456789",
          message_id: "msg_sent_01J8TEST123",
          thread_id: "thd_01J8TEST123",
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
      "draft",
      "send",
      "dft_01J8TEST123456789",
      "-i",
      "alice",
      "--expected-version",
      "1",
    ]);

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    const sendCall = fetchSpy.mock.calls[1]!;
    expect(sendCall[0]).toBe(
      "https://api.wirebox.sh/v1/mailboxes/alice%40wirebox.sh/drafts/dft_01J8TEST123456789/send"
    );
    expect(sendCall[1]?.method).toBe("POST");
    const body = JSON.parse(sendCall[1]?.body as string);
    expect(body.version).toBe(1);
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("dispatched successfully:"));
  });

  it("deletes a draft", async () => {
    const fetchSpy = mockFetchSequences([
      { data: mockIdentity },
      { data: { deleted: true, id: "dft_01J8TEST123456789" } },
    ]);

    const program = setupProgram();
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await program.parseAsync([
      "node",
      "wirebox",
      "--api-key",
      "wb_test_key",
      "mail",
      "draft",
      "delete",
      "dft_01J8TEST123456789",
      "-i",
      "alice",
    ]);

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    const delCall = fetchSpy.mock.calls[1]!;
    expect(delCall[0]).toBe(
      "https://api.wirebox.sh/v1/mailboxes/alice%40wirebox.sh/drafts/dft_01J8TEST123456789"
    );
    expect(delCall[1]?.method).toBe("DELETE");
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("Draft 'dft_01J8TEST123456789' deleted successfully."));
  });
});
