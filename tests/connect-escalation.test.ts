import { describe, expect, it } from "vitest";
import { EscalationManager } from "../src/connect/core/escalation.js";

describe("EscalationManager", () => {
  it("creates a pending approval with formatted prompt", async () => {
    const manager = new EscalationManager();
    const { approval, formattedText, promise } = manager.requestApproval({
      sessionId: "sess_1",
      contactKey: "+14155552671",
      channel: "imessage",
      toolName: "Bash Command",
      command: "git push origin main --force",
    });

    expect(approval.targetUser).toBe("+14155552671");
    expect(formattedText).toContain("⚠️ [Action Required]");
    expect(formattedText).toContain("git push origin main --force");
    expect(formattedText).toContain("Reply 1: Allow once");
    expect(formattedText).toContain("Reply 2: Always allow");
    expect(formattedText).toContain("Reply 3: Deny");

    // Check pending state
    expect(manager.getPending("+14155552671")).toBeDefined();

    // User replies "1"
    const handled = manager.handleInboundReply("+14155552671", "1");
    expect(handled).toBe(true);

    const result = await promise;
    expect(result).toBe("allow_once");
    expect(manager.getPending("+14155552671")).toBeUndefined();
  });

  it("handles shortcuts: 'yes', 'no', 'deny', 'always'", async () => {
    const manager = new EscalationManager();

    // Test 'yes'
    const req1 = manager.requestApproval({
      sessionId: "sess_1",
      contactKey: "+1001",
      channel: "imessage",
      toolName: "tool1",
    });
    expect(manager.handleInboundReply("+1001", "yes")).toBe(true);
    expect(await req1.promise).toBe("allow_once");

    // Test 'no'
    const req2 = manager.requestApproval({
      sessionId: "sess_2",
      contactKey: "+1002",
      channel: "imessage",
      toolName: "tool2",
    });
    expect(manager.handleInboundReply("+1002", "no")).toBe(true);
    expect(await req2.promise).toBe("deny");

    // Test 'always'
    const req3 = manager.requestApproval({
      sessionId: "sess_3",
      contactKey: "+1003",
      channel: "imessage",
      toolName: "tool3",
    });
    expect(manager.handleInboundReply("+1003", "always")).toBe(true);
    expect(await req3.promise).toBe("allow_always");
  });

  it("returns false for non-approval messages", () => {
    const manager = new EscalationManager();
    manager.requestApproval({
      sessionId: "sess_1",
      contactKey: "+1001",
      channel: "imessage",
      toolName: "tool1",
    });

    const handled = manager.handleInboundReply("+1001", "How is the weather today?");
    expect(handled).toBe(false);
    expect(manager.getPending("+1001")).toBeDefined();
  });
});
