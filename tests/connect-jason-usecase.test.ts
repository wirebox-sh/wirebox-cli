import { describe, expect, it } from "vitest";
import { parseWebhookPayload } from "../src/connect/core/webhook.js";
import { buildChannelPrompt, frameInboundMessage, stripMarkdown } from "../src/connect/core/prompts.js";
import { SessionManager } from "../src/connect/core/session-manager.js";
import { ClaudeCodeDriver } from "../src/connect/drivers/claude-code.js";
import { CodexDriver } from "../src/connect/drivers/codex.js";
import type { AgentDriver, ContactSession, TurnOptions, TurnResult } from "../src/connect/types.js";

describe("Jason's End-to-End Use Case Simulation", () => {
  const JASON_PHONE = "+14155552671";
  const AGENT_HANDLE = "dev-assistant";

  it("Step 1: Parses inbound iMessage from Jason and formats for mobile", () => {
    const rawTunnelPayload = {
      event: "imessage.received",
      data: {
        id: "msg_jason_101",
        sender: JASON_PHONE,
        recipient: AGENT_HANDLE,
        text: "Please check git status and summarize the changes.",
        timestamp: "2026-09-17T10:00:00Z",
      },
    };

    const event = parseWebhookPayload(rawTunnelPayload);
    expect(event).toBeDefined();
    expect(event?.channel).toBe("imessage");
    expect(event?.sender).toBe(JASON_PHONE);
    expect(event?.text).toBe("Please check git status and summarize the changes.");

    // Dynamic mobile prompt augmentation
    const channelPrompt = buildChannelPrompt("imessage");
    expect(channelPrompt).toContain("Apple iMessage");
    expect(channelPrompt).toContain("Plain text, concise and readable on a small screen");

    // Frame the prompt for the agent
    const framed = frameInboundMessage(event!);
    expect(framed).toContain(`[Inbound via IMESSAGE from ${JASON_PHONE}]`);
    expect(framed).toContain("Please check git status and summarize the changes.");
  });

  it("Step 2 & 3: Handles tool execution and remote approval escalation from Jason", async () => {
    const sessionManager = new SessionManager();
    const outboundMessages: string[] = [];

    // Mock driver simulating a tool that requires human confirmation
    class EscalatingDriver implements AgentDriver {
      readonly name = "claude-code";
      readonly displayName = "Claude Code";
      readonly description = "Test Driver";

      async isAvailable() {
        return { available: true };
      }
      async initSession() {}

      async executeTurn(
        session: ContactSession,
        _prompt: string,
        options?: TurnOptions
      ): Promise<TurnResult> {
        // Agent decides it needs to run a sensitive bash command: 'git push origin main'
        if (options?.onApprovalRequired) {
          const action = await options.onApprovalRequired({
            id: "appr_test_01",
            sessionId: session.sessionId,
            channel: session.lastChannel,
            targetUser: session.contactKey,
            toolName: "Bash Command",
            command: "git push origin main",
            detail: "Pushing 2 commits to remote main branch",
            choices: [
              { key: "1", label: "Allow once", action: "allow_once" },
              { key: "2", label: "Always allow in this session", action: "allow_always" },
              { key: "3", label: "Deny", action: "deny" },
            ],
            status: "pending",
            createdAt: Date.now(),
            expiresAt: Date.now() + 60000,
          });

          if (action === "deny") {
            return {
              text: "Action was denied by user. Command aborted.",
              toolsUsed: ["bash"],
              approvalsRequested: 1,
              completedAt: new Date().toISOString(),
            };
          }
        }

        return {
          text: "Pushed 2 commits to main successfully. Branch is up to date!",
          toolsUsed: ["bash:git push"],
          approvalsRequested: 1,
          completedAt: new Date().toISOString(),
        };
      }

      async disposeSession() {}
    }

    const driver = new EscalatingDriver();

    // Jason sends the initial command from his phone
    const turnPromise = sessionManager.handleInboundEvent(
      {
        id: "evt_jason_1",
        channel: "imessage",
        sender: JASON_PHONE,
        recipient: AGENT_HANDLE,
        text: "Please push the changes to main branch.",
        timestamp: new Date().toISOString(),
      },
      driver,
      "/test/project",
      async (reply) => {
        outboundMessages.push(reply);
      }
    );

    // Give microtask tick to let approval prompt trigger
    await new Promise((r) => setTimeout(r, 10));

    // Jason's phone should have received the approval escalation prompt
    expect(outboundMessages.length).toBe(1);
    const approvalPrompt = outboundMessages[0];
    expect(approvalPrompt).toContain("⚠️ [Action Required] Agent wants to execute: Bash Command");
    expect(approvalPrompt).toContain("Command: git push origin main");
    expect(approvalPrompt).toContain("Reply 1: Allow once");

    // Jason replies "1" from his phone
    const replyHandled = sessionManager.escalation.handleInboundReply(JASON_PHONE, "1");
    expect(replyHandled).toBe(true);

    // Await completion of the turn
    const turnResult = await turnPromise;
    expect(turnResult).toBeDefined();
    expect(turnResult?.approvalsRequested).toBe(1);
    expect(turnResult?.text).toContain("Pushed 2 commits to main successfully");

    // Jason's phone should now have received the final confirmation
    expect(outboundMessages.length).toBe(2);
    expect(outboundMessages[1]).toContain("Pushed 2 commits to main successfully");
  });

  it("Step 4: Queues consecutive messages from Jason sequentially", async () => {
    const sessionManager = new SessionManager();
    const executionOrder: string[] = [];

    class OrderedDriver implements AgentDriver {
      readonly name = "test-driver";
      readonly displayName = "Ordered Driver";
      readonly description = "Testing turn sequencing";

      async isAvailable() {
        return { available: true };
      }
      async initSession() {}
      async executeTurn(_session: ContactSession, prompt: string): Promise<TurnResult> {
        const id = prompt.includes("First") ? "First" : "Second";
        executionOrder.push(`${id}-Start`);
        await new Promise((r) => setTimeout(r, 20));
        executionOrder.push(`${id}-End`);
        return {
          text: `Done: ${id}`,
          toolsUsed: [],
          approvalsRequested: 0,
          completedAt: new Date().toISOString(),
        };
      }
      async disposeSession() {}
    }

    const driver = new OrderedDriver();

    // Jason rapidly sends two commands
    const p1 = sessionManager.handleInboundEvent(
      {
        id: "msg_1",
        channel: "imessage",
        sender: JASON_PHONE,
        recipient: AGENT_HANDLE,
        text: "First command",
        timestamp: new Date().toISOString(),
      },
      driver,
      "/test/project",
      async () => {}
    );

    const p2 = sessionManager.handleInboundEvent(
      {
        id: "msg_2",
        channel: "imessage",
        sender: JASON_PHONE,
        recipient: AGENT_HANDLE,
        text: "Second command",
        timestamp: new Date().toISOString(),
      },
      driver,
      "/test/project",
      async () => {}
    );

    await Promise.all([p1, p2]);

    // Must be strictly First-Start, First-End, Second-Start, Second-End (no overlap)
    expect(executionOrder).toEqual([
      "First-Start",
      "First-End",
      "Second-Start",
      "Second-End",
    ]);
  });

  it("Step 5: Verifies driver compatibility parity between Claude Code and Codex", () => {
    const claude = new ClaudeCodeDriver();
    const codex = new CodexDriver();

    expect(claude.name).toBe("claude-code");
    expect(codex.name).toBe("codex");

    // Both implement the standard AgentDriver contract
    expect(typeof claude.isAvailable).toBe("function");
    expect(typeof claude.executeTurn).toBe("function");
    expect(typeof codex.isAvailable).toBe("function");
    expect(typeof codex.executeTurn).toBe("function");
  });

  it("Step 6: Verifies markdown bubble stripping for mobile displays", () => {
    const richMarkdown = `
### Execution Summary
Here is the result of \`git status\`:
- Added **new_feature.ts**
- Modified [config.json](https://wirebox.sh/config)

\`\`\`bash
git commit -m "feat: complete"
\`\`\`
`;
    const mobileText = stripMarkdown(richMarkdown);
    expect(mobileText).not.toContain("###");
    expect(mobileText).not.toContain("**");
    expect(mobileText).toContain("Execution Summary");
    expect(mobileText).toContain("git status");
    expect(mobileText).toContain("Added new_feature.ts");
    expect(mobileText).toContain("config.json: https://wirebox.sh/config");
  });
});
