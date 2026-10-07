import { describe, it, expect, vi, beforeEach } from "vitest";
import { Command } from "commander";
import { registerMailCommands } from "../src/commands/mail.js";

describe("Mail Search CLI Command", () => {
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

  it("searches messages with q and limit", async () => {
    const fetchSpy = mockFetchSequences([
      { data: mockIdentity },
      {
        data: {
          items: [],
          messages: [
            {
              id: "msg_search_01",
              direction: "inbound",
              subject: "Invoice follow-up",
              from_address: "billing@vendor.com",
              snippet: "invoice #1042 is now overdue",
              highlight: "invoice #1042 is now <b>overdue</b>",
              created_at: "2026-09-18T12:00:00Z",
            },
          ],
          count: 1,
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
      "search",
      "--identity",
      "alice",
      "--query",
      "invoice",
      "--limit",
      "5",
    ]);

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    const searchCall = fetchSpy.mock.calls[1];
    expect(searchCall![0]).toBe(
      "https://api.wirebox.sh/v1/mailboxes/alice%40wirebox.sh/search?q=invoice&limit=5"
    );

    const printed = logSpy.mock.calls.map((call) => call.join(" ")).join("\n");
    expect(printed).toContain("msg_search_01");
    expect(printed).toContain("overdue");
    expect(printed).toContain('1 match for "invoice"');
  });

  it("reports when nothing matches", async () => {
    mockFetchSequences([
      { data: mockIdentity },
      { data: { items: [], messages: [], count: 0 } },
    ]);

    const program = setupProgram();
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await program.parseAsync([
      "node",
      "wirebox",
      "--api-key",
      "wb_test_key",
      "mail",
      "search",
      "--identity",
      "alice",
      "--query",
      "no-match",
    ]);

    expect(logSpy).toHaveBeenCalledWith('No messages matched "no-match".');
  });
});
