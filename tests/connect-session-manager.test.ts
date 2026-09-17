import { describe, expect, it } from "vitest";
import { SessionManager } from "../src/connect/core/session-manager.js";
import type { AgentDriver, ContactSession, TurnOptions, TurnResult } from "../src/connect/types.js";

class MockDriver implements AgentDriver {
  public readonly name = "mock-agent";
  public readonly displayName = "Mock Agent";
  public readonly description = "Mock Agent for testing";
  public calls: Array<{ session: ContactSession; prompt: string }> = [];
  public executeDelayMs = 20;

  async isAvailable() {
    return { available: true };
  }

  async initSession() {}

  async executeTurn(
    session: ContactSession,
    prompt: string,
    _options?: TurnOptions
  ): Promise<TurnResult> {
    this.calls.push({ session, prompt });
    if (this.executeDelayMs > 0) {
      await new Promise((r) => setTimeout(r, this.executeDelayMs));
    }
    return {
      text: `Mock response to: ${prompt.slice(0, 30)}`,
      toolsUsed: ["mock-tool"],
      approvalsRequested: 0,
      completedAt: new Date().toISOString(),
    };
  }

  async disposeSession() {}
}

describe("SessionManager", () => {
  it("normalizes phone numbers and emails consistently", () => {
    const sm = new SessionManager();
    expect(sm.normalizeContactKey("+1 (415) 555-2671")).toBe("+14155552671");
    expect(sm.normalizeContactKey("User.Name@Example.COM")).toBe("user.name@example.com");
    expect(sm.normalizeContactKey("4155552671")).toBe("+4155552671");
  });

  it("reuses existing session across multiple messages from the same user", () => {
    const sm = new SessionManager();
    const sess1 = sm.getOrCreateSession({
      contactKey: "+14155552671",
      channel: "imessage",
      projectDir: "/tmp/project",
      driverName: "claude-code",
    });

    const sess2 = sm.getOrCreateSession({
      contactKey: "+1 (415) 555-2671",
      channel: "email",
      projectDir: "/tmp/project",
      driverName: "claude-code",
    });

    expect(sess1.sessionId).toBe(sess2.sessionId);
    expect(sess2.lastChannel).toBe("email");
  });

  it("queues turns sequentially for the same contact", async () => {
    const sm = new SessionManager();
    const driver = new MockDriver();
    const replies: string[] = [];

    const p1 = sm.handleInboundEvent(
      {
        id: "evt_1",
        channel: "imessage",
        sender: "+14155552671",
        recipient: "agent",
        text: "Turn 1",
        timestamp: new Date().toISOString(),
      },
      driver,
      "/tmp/project",
      async (reply) => {
        replies.push(reply);
      }
    );

    const p2 = sm.handleInboundEvent(
      {
        id: "evt_2",
        channel: "imessage",
        sender: "+14155552671",
        recipient: "agent",
        text: "Turn 2",
        timestamp: new Date().toISOString(),
      },
      driver,
      "/tmp/project",
      async (reply) => {
        replies.push(reply);
      }
    );

    await Promise.all([p1, p2]);

    expect(driver.calls.length).toBe(2);
    expect(replies.length).toBe(2);
    expect(driver.calls[0].prompt).toContain("Turn 1");
    expect(driver.calls[1].prompt).toContain("Turn 2");
  });
});
