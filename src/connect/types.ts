/**
 * Core type definitions for Wirebox Agent Bridge
 */

export type InboundChannel = "imessage" | "email" | "sms";

export interface InboundEvent {
  id: string;
  channel: InboundChannel;
  conversationId?: string;
  sender: string; // Phone number or email address
  recipient: string; // Agent's number or email
  subject?: string;
  text: string;
  mediaUrls?: string[];
  timestamp: string;
  raw?: Record<string, unknown>;
}

export interface OutboundReply {
  channel: InboundChannel;
  to: string;
  subject?: string;
  text: string;
  mediaUrls?: string[];
}

export type ApprovalStatus = "pending" | "approved" | "denied" | "expired";

export interface ApprovalChoice {
  key: string; // e.g. "1", "2", "3"
  label: string; // e.g. "Allow once", "Always allow", "Deny"
  action: "allow_once" | "allow_always" | "deny";
}

export interface PendingApproval {
  id: string;
  sessionId: string;
  channel: InboundChannel;
  targetUser: string;
  toolName: string;
  command?: string;
  detail?: string;
  choices: ApprovalChoice[];
  status: ApprovalStatus;
  createdAt: number;
  expiresAt: number;
  resolve?: (value: ApprovalChoice["action"]) => void;
}

export interface TurnOptions {
  onOutputChunk?: (chunk: string) => void;
  onApprovalRequired?: (approval: PendingApproval) => Promise<ApprovalChoice["action"]>;
}

export interface TurnResult {
  text: string;
  toolsUsed: string[];
  approvalsRequested: number;
  completedAt: string;
}

export interface ContactSession {
  sessionId: string;
  contactKey: string; // Normalized phone or email
  lastChannel: InboundChannel;
  projectDir: string;
  driverName: string;
  createdAt: string;
  lastActiveAt: string;
  metadata?: Record<string, unknown>;
}

/**
 * Pluggable Agent Driver contract (Claude Code, OpenAI Codex, OpenCode, Custom)
 */
export interface AgentDriver {
  readonly name: string;
  readonly displayName: string;
  readonly description: string;

  /**
   * Validates if the local runtime/binary for this agent is installed and authenticated
   */
  isAvailable(): Promise<{ available: boolean; reason?: string; version?: string }>;

  /**
   * Initializes or restores an isolated agent session for a given contact
   */
  initSession(session: ContactSession): Promise<void>;

  /**
   * Dispatches an inbound prompt turn to the agent and awaits execution
   */
  executeTurn(
    session: ContactSession,
    prompt: string,
    options?: TurnOptions
  ): Promise<TurnResult>;

  /**
   * Gracefully tears down the agent session
   */
  disposeSession(sessionId: string): Promise<void>;
}

export interface ConnectConfig {
  apiKey: string;
  baseUrl?: string;
  identityHandle?: string;
  projectDir: string;
  defaultDriver: string;
  tunnelDomain?: string;
  autoStartDaemon?: boolean;
}

export type BridgeConfig = ConnectConfig;

