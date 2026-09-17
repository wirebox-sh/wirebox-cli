import { Wirebox, type AgentIdentity } from "@wirebox-sh/sdk";
import type { AgentDriver, ConnectConfig, InboundEvent } from "../types.js";
import { TunnelClient } from "./tunnel.js";
import { parseWebhookPayload } from "./webhook.js";
import { SessionManager } from "./session-manager.js";
import { globalDriverRegistry } from "../drivers/base.js";
import { CLI_VERSION } from "../../client.js";

export class WireboxConnect {
  private client: Wirebox;
  private identity?: AgentIdentity;
  private tunnelClient: TunnelClient | null = null;
  public readonly sessionManager: SessionManager;
  private activeDriver: AgentDriver;
  private isRunning = false;

  constructor(private config: ConnectConfig) {
    this.client = new Wirebox({
      apiKey: config.apiKey,
      baseUrl: config.baseUrl,
    });
    this.sessionManager = new SessionManager();

    // Resolve driver from registry
    const driver = globalDriverRegistry.get(config.defaultDriver);
    if (!driver) {
      throw new Error(
        `Agent driver '${config.defaultDriver}' is not registered. Available: ${globalDriverRegistry
          .list()
          .map((d) => d.name)
          .join(", ")}`
      );
    }
    this.activeDriver = driver;
  }

  public async start(): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;

    // 1. Resolve agent identity
    let agentHandle = this.config.identityHandle;
    if (!agentHandle) {
      const res = await this.client.listIdentities({ limit: 1 });
      const firstIdentity = res.identities?.[0];
      if (firstIdentity) {
        this.identity = firstIdentity;
        agentHandle = firstIdentity.agent_handle;
      } else {
        throw new Error("No agent identity found. Please create one on wirebox.sh/console first.");
      }
    } else {
      this.identity = await this.client.getIdentity(agentHandle);
    }

    // 2. Compute official WebSocket tunnel URL (via Core API gateway)
    const apiBase = this.config.baseUrl || "https://api.wirebox.sh";
    const wsProto = apiBase.startsWith("https") ? "wss" : "ws";
    const hostAndPath = apiBase.replace(/^https?:\/\//, "").replace(/\/+$/, "");
    const tunnelUrl = `${wsProto}://${hostAndPath}/v1/tunnels/${encodeURIComponent(agentHandle!)}/connect?api_key=${encodeURIComponent(this.config.apiKey)}&forward_to=http://localhost:3000&client_version=${encodeURIComponent(`wirebox-cli/${CLI_VERSION}`)}`;

    // 3. Ensure inbound webhook is registered for this tunnel
    const domain = this.config.tunnelDomain || "wirebox.run";
    const expectedWebhookUrl = `https://${agentHandle}.${domain}/webhook`;
    try {
      const existingWebhooks = await this.client.webhooks.list();
      const hasWebhook = existingWebhooks.some((w) => w.url === expectedWebhookUrl);
      if (!hasWebhook) {
        await this.client.webhooks.create({
          url: expectedWebhookUrl,
          events: ["*"],
          agent: agentHandle,
        });
        console.log(`[Wirebox Connect] Webhook route created: ${expectedWebhookUrl}`);
      } else {
        console.log(`[Wirebox Connect] Webhook route verified: ${expectedWebhookUrl}`);
      }
    } catch (err: any) {
      console.warn(`[Wirebox Connect] Webhook registration notice: ${err?.message || err}`);
    }

    // 4. Connect tunnel
    this.tunnelClient = new TunnelClient({
      tunnelUrl,
      token: this.config.apiKey,
      onConnect: () => {
        console.log(`[Wirebox Connect] 🟢 Connected to Wirebox Tunnel: @${agentHandle}`);
        console.log(`[Wirebox Connect] Active Agent Driver: ${this.activeDriver.displayName}`);
        console.log(`[Wirebox Connect] Workspace: ${this.config.projectDir}`);
        console.log(`[Wirebox Connect] 📱 Test from iPhone: text "connect @${agentHandle}" to +1 (628) 264-9335`);
      },
      onDisconnect: () => {
        console.log("[Wirebox Connect] Tunnel disconnected. Attempting to reconnect...");
      },
      onError: (err) => {
        console.error("[Wirebox Connect] Tunnel error:", err.message);
      },
      onMessage: async (rawMessage) => {
        await this.handleTunnelFrame(rawMessage, agentHandle!);
      },
    });

    this.tunnelClient.connect();
  }

  private async handleTunnelFrame(rawMessage: string, agentHandle: string): Promise<void> {
    try {
      const payload = JSON.parse(rawMessage);
      const event = parseWebhookPayload(payload);

      if (!event) {
        return; // Non-event message, handshake, or ping
      }

      await this.processInboundEvent(event, agentHandle);
    } catch (err: any) {
      console.error("[Wirebox Connect] Error processing tunnel frame:", err.message);
    }
  }

  public async processInboundEvent(event: InboundEvent, agentHandle: string): Promise<void> {
    console.log(
      `[Wirebox Connect] Inbound ${event.channel.toUpperCase()} from ${event.sender}: "${event.text.slice(0, 60)}..."`
    );

    await this.sessionManager.handleInboundEvent(
      event,
      this.activeDriver,
      this.config.projectDir,
      async (replyText) => {
        await this.sendReply(event, replyText, agentHandle);
      }
    );
  }

  private async sendReply(
    inboundEvent: InboundEvent,
    replyText: string,
    agentHandle: string
  ): Promise<void> {
    try {
      if (!this.identity) {
        this.identity = await this.client.getIdentity(agentHandle);
      }

      if (inboundEvent.channel === "imessage") {
        if (inboundEvent.conversationId) {
          await this.identity.sendImessage({
            conversation_id: inboundEvent.conversationId,
            text: replyText,
          });
        } else {
          await this.identity.sendImessage({
            to: inboundEvent.sender,
            text: replyText,
          });
        }
        console.log(`[Wirebox Connect] Replied via iMessage to ${inboundEvent.sender}`);
      } else if (inboundEvent.channel === "email") {
        await this.identity.sendEmail({
          to: inboundEvent.sender,
          subject: inboundEvent.subject ? `Re: ${inboundEvent.subject}` : "Wirebox Agent Reply",
          text: replyText,
        });
        console.log(`[Wirebox Connect] Replied via Email to ${inboundEvent.sender}`);
      }
    } catch (err: any) {
      console.error(`[Wirebox Connect] Failed to send ${inboundEvent.channel} reply:`, err.message);
    }
  }

  public async stop(): Promise<void> {
    this.isRunning = false;
    if (this.tunnelClient) {
      this.tunnelClient.close();
      this.tunnelClient = null;
    }
  }
}

// Backwards compatibility alias
export const WireboxBridge = WireboxConnect;
export type WireboxBridge = WireboxConnect;
