import { describe, it, expect, vi, beforeEach } from "vitest";
import { Command } from "commander";
import { registerMailCommands } from "../src/commands/mail.js";

describe("Mail Rules & Policy CLI Commands", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  const mockIdentity = {
    id: "agt_01J8ABC123456789",
    agent_handle: "alice",
    display_name: "Alice",
    mail_filter_mode: "blacklist",
    mail_inbound_filter_mode: "whitelist",
    mail_outbound_filter_mode: "blacklist",
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

  const mockRule = {
    id: "mrl_01J8RULE12345678",
    identity_id: "agt_01J8ABC123456789",
    agent_handle: "alice",
    type: "email",
    entry: "bob@example.com",
    match_target: "bob@example.com",
    action: "allow",
    direction: "inbound",
    reason: "Trusted partner",
    status: "active",
    created_at: "2026-09-18T10:00:00Z",
    updated_at: "2026-09-18T10:00:00Z",
  };

  function setupProgram() {
    const program = new Command()
      .option("--api-key <key>")
      .option("--json", "", false);
    registerMailCommands(program);
    return program;
  }

  // Helper to mock fetch responses in sequence
  function mockFetchSequences(responses: Array<{ status?: number; data?: any; text?: string }>) {
    let callIndex = 0;
    return vi.spyOn(globalThis, "fetch").mockImplementation(async (url: any, init?: any) => {
      const respDef = responses[callIndex++] || responses[responses.length - 1];
      const status = respDef.status ?? 200;
      return {
        ok: status >= 200 && status < 300,
        status,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => respDef.data ?? {},
        text: async () => respDef.text ?? JSON.stringify(respDef.data ?? {}),
      } as Response;
    });
  }

  it("registers mail rules and policy subcommands under mail strictly without polluting root", () => {
    const program = setupProgram();

    const mailCmd = program.commands.find((c) => c.name() === "mail");
    expect(mailCmd).toBeDefined();

    const mailSubNames = mailCmd!.commands.map((c) => c.name());
    expect(mailSubNames).toContain("rules");
    expect(mailSubNames).toContain("policy");

    const rulesCmd = mailCmd!.commands.find((c) => c.name() === "rules");
    expect(rulesCmd).toBeDefined();
    const rulesSubNames = rulesCmd!.commands.map((c) => c.name());
    expect(rulesSubNames).toContain("list");
    expect(rulesSubNames).toContain("allow");
    expect(rulesSubNames).toContain("block");
    expect(rulesSubNames).toContain("add");
    expect(rulesSubNames).toContain("remove");

    const policyCmd = mailCmd!.commands.find((c) => c.name() === "policy");
    expect(policyCmd).toBeDefined();
    const policySubNames = policyCmd!.commands.map((c) => c.name());
    expect(policySubNames).toContain("get");
    expect(policySubNames).toContain("set");

    // Root namespace should stay clean without redundant aliases
    const topRulesCmd = program.commands.find((c) => c.name() === "mail-rules");
    expect(topRulesCmd).toBeUndefined();
  });

  describe("rules list", () => {
    it("lists mail rules and formats policy posture", async () => {
      const fetchSpy = mockFetchSequences([
        { data: mockIdentity }, // getIdentity
        { data: { rules: [mockRule], total: 1 } }, // list mail rules
      ]);

      const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      const program = setupProgram();

      await program.parseAsync([
        "node",
        "wirebox",
        "--api-key",
        "wb_live_test",
        "mail",
        "rules",
        "list",
        "alice",
        "--direction",
        "inbound",
      ]);

      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining("/v1/identities/alice"),
        expect.objectContaining({ method: "GET" })
      );
      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining("/v1/identities/alice/mail-rules?direction=inbound"),
        expect.objectContaining({ method: "GET" })
      );

      const loggedOutput = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
      expect(loggedOutput).toContain("Agent: @alice (alice@wirebox.sh)");
      expect(loggedOutput).toContain("PROTECTED");
      expect(loggedOutput).toContain("bob@example.com");
    });

    it("supports json output flag", async () => {
      mockFetchSequences([
        { data: mockIdentity },
        { data: { rules: [mockRule], total: 1 } },
      ]);

      const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      const program = setupProgram();

      await program.parseAsync([
        "node",
        "wirebox",
        "--api-key",
        "wb_live_test",
        "--json",
        "mail",
        "rules",
        "list",
        "alice",
      ]);

      const loggedJson = JSON.parse(logSpy.mock.calls[0][0]);
      expect(loggedJson.identity.handle).toBe("alice");
      expect(loggedJson.policy.inbound).toBe("protected");
      expect(loggedJson.policy.outbound).toBe("open");
      expect(loggedJson.rules).toHaveLength(1);
      expect(loggedJson.rules[0].entry).toBe("bob@example.com");
    });
  });

  describe("rules allow & block", () => {
    it("allows email with positional handle and entry", async () => {
      const fetchSpy = mockFetchSequences([
        { data: mockIdentity },
        { data: mockRule },
      ]);

      const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      const program = setupProgram();

      await program.parseAsync([
        "node",
        "wirebox",
        "--api-key",
        "wb_live_test",
        "mail",
        "rules",
        "allow",
        "alice",
        "bob@example.com",
        "--inbound",
        "--reason",
        "Trusted partner",
      ]);

      const postCall = fetchSpy.mock.calls.find((c) => c[1]?.method === "POST");
      expect(postCall).toBeDefined();
      expect(postCall![0]).toBe("https://api.wirebox.sh/v1/identities/alice/mail-rules");
      expect(JSON.parse(postCall![1]?.body as string)).toEqual({
        entry: "bob@example.com",
        action: "allow",
        direction: "inbound",
        reason: "Trusted partner",
      });

      const loggedOutput = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
      expect(loggedOutput).toContain("Allowed 'bob@example.com' for @alice");
    });

    it("allows entry with -i flag instead of positional handle", async () => {
      const fetchSpy = mockFetchSequences([
        { data: mockIdentity },
        { data: mockRule },
      ]);

      vi.spyOn(console, "log").mockImplementation(() => {});
      const program = setupProgram();

      await program.parseAsync([
        "node",
        "wirebox",
        "--api-key",
        "wb_live_test",
        "mail",
        "rules",
        "allow",
        "bob@example.com",
        "-i",
        "alice",
      ]);

      const postCall = fetchSpy.mock.calls.find((c) => c[1]?.method === "POST");
      expect(postCall).toBeDefined();
      expect(postCall![0]).toBe("https://api.wirebox.sh/v1/identities/alice/mail-rules");
      expect(JSON.parse(postCall![1]?.body as string)).toEqual({
        entry: "bob@example.com",
        action: "allow",
        direction: "both",
      });
    });

    it("blocks domain entry", async () => {
      const blockedRule = {
        ...mockRule,
        id: "mrl_01J8BLOCK12345",
        entry: "evil.com",
        match_target: "evil.com",
        action: "block",
        direction: "both",
        reason: "Malicious domain",
      };

      const fetchSpy = mockFetchSequences([
        { data: mockIdentity },
        { data: blockedRule },
      ]);

      const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      const program = setupProgram();

      await program.parseAsync([
        "node",
        "wirebox",
        "--api-key",
        "wb_live_test",
        "mail",
        "rules",
        "block",
        "alice",
        "evil.com",
        "--reason",
        "Malicious domain",
      ]);

      const postCall = fetchSpy.mock.calls.find((c) => c[1]?.method === "POST");
      expect(postCall).toBeDefined();
      expect(postCall![0]).toBe("https://api.wirebox.sh/v1/identities/alice/mail-rules");
      expect(JSON.parse(postCall![1]?.body as string)).toEqual({
        entry: "evil.com",
        action: "block",
        direction: "both",
        reason: "Malicious domain",
      });

      const loggedOutput = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
      expect(loggedOutput).toContain("Blocked 'evil.com' for @alice");
    });
  });

  describe("rules add (full specification)", () => {
    it("adds rule with explicit --block and --outbound flags", async () => {
      const fetchSpy = mockFetchSequences([
        { data: mockIdentity },
        {
          data: {
            ...mockRule,
            action: "block",
            direction: "outbound",
            entry: "competitor.com",
          },
        },
      ]);

      vi.spyOn(console, "log").mockImplementation(() => {});
      const program = setupProgram();

      await program.parseAsync([
        "node",
        "wirebox",
        "--api-key",
        "wb_live_test",
        "mail",
        "rules",
        "add",
        "alice",
        "competitor.com",
        "--block",
        "--outbound",
        "--reason",
        "Prevent exfiltration",
      ]);

      const postCall = fetchSpy.mock.calls.find((c) => c[1]?.method === "POST");
      expect(postCall).toBeDefined();
      expect(postCall![0]).toBe("https://api.wirebox.sh/v1/identities/alice/mail-rules");
      expect(JSON.parse(postCall![1]?.body as string)).toEqual({
        entry: "competitor.com",
        action: "block",
        direction: "outbound",
        reason: "Prevent exfiltration",
      });
    });
  });

  describe("rules remove", () => {
    it("deletes directly by rule ID when target starts with mrl_", async () => {
      const fetchSpy = mockFetchSequences([
        { data: mockIdentity },
        { data: { deleted: true, id: "mrl_01J8RULE12345678" } },
      ]);

      const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      const program = setupProgram();

      await program.parseAsync([
        "node",
        "wirebox",
        "--api-key",
        "wb_live_test",
        "mail",
        "rules",
        "remove",
        "alice",
        "mrl_01J8RULE12345678",
      ]);

      expect(fetchSpy).toHaveBeenCalledWith(
        "https://api.wirebox.sh/v1/identities/alice/mail-rules/mrl_01J8RULE12345678",
        expect.objectContaining({ method: "DELETE" })
      );

      const loggedOutput = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
      expect(loggedOutput).toContain("Deleted rule 'mrl_01J8RULE12345678' from @alice");
    });

    it("looks up and deletes rules matching email entry", async () => {
      const fetchSpy = mockFetchSequences([
        { data: mockIdentity }, // getIdentity
        { data: { rules: [mockRule], total: 1 } }, // list
        { data: { deleted: true, id: "mrl_01J8RULE12345678" } }, // delete
      ]);

      const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      const program = setupProgram();

      await program.parseAsync([
        "node",
        "wirebox",
        "--api-key",
        "wb_live_test",
        "mail",
        "rules",
        "remove",
        "alice",
        "bob@example.com",
      ]);

      expect(fetchSpy).toHaveBeenCalledWith(
        "https://api.wirebox.sh/v1/identities/alice/mail-rules/mrl_01J8RULE12345678",
        expect.objectContaining({ method: "DELETE" })
      );

      const loggedOutput = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
      expect(loggedOutput).toContain("Deleted 1 rule(s) matching 'bob@example.com' from @alice");
    });
  });

  describe("policy get & set", () => {
    it("retrieves current policy", async () => {
      const fetchSpy = mockFetchSequences([
        { data: mockIdentity }, // getIdentity
        {
          data: {
            mail_inbound_filter_mode: "whitelist",
            mail_outbound_filter_mode: "blacklist",
          },
        }, // getPolicy
      ]);

      const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      const program = setupProgram();

      await program.parseAsync([
        "node",
        "wirebox",
        "--api-key",
        "wb_live_test",
        "mail",
        "policy",
        "get",
        "alice",
      ]);

      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining("/v1/identities/alice"),
        expect.objectContaining({ method: "GET" })
      );

      const loggedOutput = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
      expect(loggedOutput).toContain("PROTECTED");
      expect(loggedOutput).toContain("OPEN");
    });

    it("updates policy with --inbound and --outbound flags", async () => {
      const fetchSpy = mockFetchSequences([
        { data: mockIdentity }, // getIdentity
        {
          data: {
            mail_inbound_filter_mode: "whitelist",
            mail_outbound_filter_mode: "whitelist",
          },
        }, // setPolicy patch
      ]);

      const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      const program = setupProgram();

      await program.parseAsync([
        "node",
        "wirebox",
        "--api-key",
        "wb_live_test",
        "mail",
        "policy",
        "set",
        "alice",
        "--inbound",
        "protected",
        "--outbound",
        "restricted",
      ]);

      const patchCall = fetchSpy.mock.calls.find((c) => c[1]?.method === "PATCH");
      expect(patchCall).toBeDefined();
      expect(patchCall![0]).toBe("https://api.wirebox.sh/v1/identities/alice");
      expect(JSON.parse(patchCall![1]?.body as string)).toEqual({
        mail_inbound_filter_mode: "whitelist",
        mail_outbound_filter_mode: "whitelist",
      });

      const loggedOutput = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
      expect(loggedOutput).toContain("Updated security policy for @alice");
      expect(loggedOutput).toContain("PROTECTED");
      expect(loggedOutput).toContain("RESTRICTED");
    });
  });
});
