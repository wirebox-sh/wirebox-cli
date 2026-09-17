import type {
  ApprovalChoice,
  InboundChannel,
  PendingApproval,
} from "../types.js";

export const DEFAULT_APPROVAL_CHOICES: ApprovalChoice[] = [
  { key: "1", label: "Allow once", action: "allow_once" },
  { key: "2", label: "Always allow in this session", action: "allow_always" },
  { key: "3", label: "Deny", action: "deny" },
];

export class EscalationManager {
  private pending = new Map<string, PendingApproval>(); // Keyed by contactKey

  /**
   * Registers a new pending approval for a contact
   */
  requestApproval(params: {
    sessionId: string;
    contactKey: string;
    channel: InboundChannel;
    toolName: string;
    command?: string;
    detail?: string;
    timeoutMs?: number;
    choices?: ApprovalChoice[];
  }): {
    approval: PendingApproval;
    formattedText: string;
    promise: Promise<ApprovalChoice["action"]>;
  } {
    const id = `appr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const choices = params.choices || DEFAULT_APPROVAL_CHOICES;
    const timeoutMs = params.timeoutMs || 15 * 60 * 1000; // 15 min default timeout
    const now = Date.now();

    let resolver: (val: ApprovalChoice["action"]) => void;
    const promise = new Promise<ApprovalChoice["action"]>((resolve) => {
      resolver = resolve;
    });

    const approval: PendingApproval = {
      id,
      sessionId: params.sessionId,
      channel: params.channel,
      targetUser: params.contactKey,
      toolName: params.toolName,
      command: params.command,
      detail: params.detail,
      choices,
      status: "pending",
      createdAt: now,
      expiresAt: now + timeoutMs,
      resolve: (action) => {
        approval.status = action === "deny" ? "denied" : "approved";
        this.pending.delete(params.contactKey);
        resolver(action);
      },
    };

    this.pending.set(params.contactKey, approval);

    const formattedText = this.formatApprovalPrompt(approval);
    return { approval, formattedText, promise };
  }

  /**
   * Formats approval request into clear, mobile-friendly choices
   */
  formatApprovalPrompt(approval: PendingApproval): string {
    const lines = [
      `⚠️ [Action Required] Agent wants to execute: ${approval.toolName}`,
    ];

    if (approval.command) {
      lines.push(`Command: ${approval.command}`);
    }
    if (approval.detail) {
      lines.push(`Details: ${approval.detail}`);
    }

    lines.push("");
    for (const choice of approval.choices) {
      lines.push(`Reply ${choice.key}: ${choice.label}`);
    }

    return lines.join("\n");
  }

  /**
   * Checks if there is an active pending approval for a contact
   */
  getPending(contactKey: string): PendingApproval | undefined {
    const item = this.pending.get(contactKey);
    if (!item) return undefined;

    // Check expiration
    if (Date.now() > item.expiresAt) {
      item.status = "expired";
      item.resolve?.("deny");
      this.pending.delete(contactKey);
      return undefined;
    }

    return item;
  }

  /**
   * Parses an inbound message from a contact to check if it matches an approval choice
   */
  handleInboundReply(contactKey: string, text: string): boolean {
    const pending = this.getPending(contactKey);
    if (!pending) return false;

    const trimmed = text.trim().toLowerCase();

    // Check by number key ("1", "2", "3")
    for (const choice of pending.choices) {
      if (trimmed === choice.key.toLowerCase()) {
        pending.resolve?.(choice.action);
        return true;
      }
    }

    // Check common English shortcuts
    if (["yes", "y", "allow", "ok", "proceed"].includes(trimmed)) {
      pending.resolve?.("allow_once");
      return true;
    }
    if (["no", "n", "deny", "cancel", "stop", "abort"].includes(trimmed)) {
      pending.resolve?.("deny");
      return true;
    }
    if (["always", "all"].includes(trimmed)) {
      pending.resolve?.("allow_always");
      return true;
    }

    return false;
  }
}
