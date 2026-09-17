import type {
  AgentDriver,
  ContactSession,
  InboundChannel,
  InboundEvent,
  TurnResult,
} from "../types.js";
import { frameInboundMessage } from "./prompts.js";
import { EscalationManager } from "./escalation.js";

export class SessionManager {
  private sessions = new Map<string, ContactSession>(); // Keyed by contactKey
  private turnQueues = new Map<string, Promise<unknown>>(); // Keyed by contactKey for sequential queuing
  public readonly escalation: EscalationManager;

  constructor() {
    this.escalation = new EscalationManager();
  }

  /**
   * Normalizes a contact handle (E.164 phone number or lowercase email)
   */
  public normalizeContactKey(raw: string): string {
    const trimmed = raw.trim();
    if (trimmed.includes("@")) {
      return trimmed.toLowerCase();
    }
    // E.164 normalize: remove spaces, dashes, parentheses
    const digitsOnly = trimmed.replace(/[\s\-\(\)\.]/g, "");
    if (digitsOnly.startsWith("+")) {
      return digitsOnly;
    }
    return `+${digitsOnly}`;
  }

  /**
   * Gets or creates a persistent session for a contact
   */
  public getOrCreateSession(params: {
    contactKey: string;
    channel: InboundChannel;
    projectDir: string;
    driverName: string;
  }): ContactSession {
    const key = this.normalizeContactKey(params.contactKey);
    let session = this.sessions.get(key);

    if (!session) {
      session = {
        sessionId: `sess_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        contactKey: key,
        lastChannel: params.channel,
        projectDir: params.projectDir,
        driverName: params.driverName,
        createdAt: new Date().toISOString(),
        lastActiveAt: new Date().toISOString(),
      };
      this.sessions.set(key, session);
    } else {
      // Update channel and timestamp
      session.lastChannel = params.channel;
      session.lastActiveAt = new Date().toISOString();
    }

    return session;
  }

  /**
   * Dispatches an inbound event through the sequential turn queue for this contact
   */
  public async handleInboundEvent(
    event: InboundEvent,
    driver: AgentDriver,
    projectDir: string,
    onReply: (replyText: string) => Promise<void>
  ): Promise<TurnResult | null> {
    const contactKey = this.normalizeContactKey(event.sender);

    // 1. Check if this is an answer to an active pending approval
    if (this.escalation.handleInboundReply(contactKey, event.text)) {
      // The pending approval was resolved by this reply!
      return null;
    }

    // 2. Resolve or create session
    const session = this.getOrCreateSession({
      contactKey,
      channel: event.channel,
      projectDir,
      driverName: driver.name,
    });

    // 3. Sequential Turn Queue: enqueue behind any currently executing turn for this user
    const currentQueue = this.turnQueues.get(contactKey) || Promise.resolve();

    const turnPromise = currentQueue
      .catch(() => {}) // Don't let previous failures crash subsequent turns
      .then(async () => {
        // Frame the inbound prompt with channel headers
        const framedPrompt = frameInboundMessage(event);

        const turnResult = await driver.executeTurn(session, framedPrompt, {
          onApprovalRequired: async (approval) => {
            // Register approval with escalation manager
            const { formattedText, promise } = this.escalation.requestApproval({
              sessionId: session.sessionId,
              contactKey,
              channel: session.lastChannel,
              toolName: approval.toolName,
              command: approval.command,
              detail: approval.detail,
              choices: approval.choices,
            });

            // Send escalation prompt to user over their active communication channel
            await onReply(formattedText);

            // Wait until user replies 1/2/3 or timeout
            return promise;
          },
        });

        // Send final response back to user
        if (turnResult.text) {
          await onReply(turnResult.text);
        }

        return turnResult;
      });

    this.turnQueues.set(contactKey, turnPromise);
    return turnPromise;
  }

  /**
   * Returns all active sessions
   */
  public listSessions(): ContactSession[] {
    return Array.from(this.sessions.values());
  }

  /**
   * Cleans up a session
   */
  public removeSession(contactKey: string) {
    const key = this.normalizeContactKey(contactKey);
    this.sessions.delete(key);
    this.turnQueues.delete(key);
  }
}
