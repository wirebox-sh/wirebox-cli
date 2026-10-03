/**
 * Wirebox CLI - iMessage Communication Commands
 */

import { Command } from "commander";
import qrcode from "qrcode-terminal";
import { createClient, getGlobalOpts } from "../client.js";
import { withErrorHandler } from "../errors.js";
import { output } from "../output.js";

const CONVERSATION_COLUMNS = [
  "id",
  "identity_id",
  "user_phone",
  "status",
  "unread_count",
  "last_message",
  "updated_at",
];

const MESSAGE_COLUMNS = [
  "id",
  "direction",
  "sender",
  "text",
  "media_url",
  "created_at",
];

function formatRelativeTime(isoString?: string | null): string {
  if (!isoString) return "-";
  try {
    const diffMs = Date.now() - new Date(isoString).getTime();
    if (isNaN(diffMs) || diffMs < 0) return isoString.slice(0, 16).replace("T", " ");
    const diffSec = Math.floor(diffMs / 1000);
    if (diffSec < 60) return "just now";
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHours = Math.floor(diffMin / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 30) return `${diffDays}d ago`;
    return isoString.slice(0, 10);
  } catch {
    return isoString;
  }
}

export function registerIMessageCommands(program: Command): void {
  const imessage = program
    .command("imessage")
    .description("iMessage real-world communication channel for AI agents");

  // 1. wirebox imessage router [handle]
  imessage
    .command("router [handle]")
    .description("Display iMessage router number, connect command, and scan-to-connect QR code")
    .option("--user-phone <phone>", "Resolve router assigned specifically to a user phone number")
    .action(
      withErrorHandler(async function (
        this: Command,
        handle: string | undefined,
        cmdOpts: { userPhone?: string }
      ) {
        const opts = getGlobalOpts(this);
        const client = createClient(opts);

        const router = await client.imessage.getRouter({
          agent: handle,
          user_phone: cmdOpts.userPhone,
        });

        if (opts.json) {
          output(router, { json: true });
          return;
        }

        console.log("------------------------------------------------------------");
        console.log(`Router Number   : ${router.router_number}`);
        console.log(`Agent Handle    : @${router.agent_handle}`);
        console.log(`Connect Command : ${router.connect_command}`);
        console.log(`Status          : ${router.status}`);
        console.log("------------------------------------------------------------");
        console.log("Scan with iPhone Camera to Connect (opens Messages automatically):");

        qrcode.generate(router.qr_uri, { small: true }, (qr) => {
          console.log(qr);
        });
      })
    );

  // 2. wirebox imessage conversations
  imessage
    .command("conversations")
    .description("List active and past iMessage conversations")
    .option("-i, --identity <handle>", "Filter by agent identity handle")
    .option("--status <status>", "Filter by status: connected or disconnected")
    .option("--limit <n>", "Max conversations to return (default: 20)", (v) => parseInt(v, 10))
    .option("--cursor <cursor>", "Cursor for pagination")
    .option("--raw", "Display table instead of conversation card view", false)
    .action(
      withErrorHandler(async function (
        this: Command,
        cmdOpts: {
          identity?: string;
          status?: "connected" | "disconnected";
          limit?: number;
          cursor?: string;
          raw?: boolean;
        }
      ) {
        const opts = getGlobalOpts(this);
        const client = createClient(opts);

        let identityId: string | undefined;
        if (cmdOpts.identity) {
          const agent = await client.getIdentity(cmdOpts.identity);
          identityId = agent.id;
        }

        const res = await client.imessage.conversations.list({
          identity_id: identityId,
          status: cmdOpts.status,
          limit: cmdOpts.limit,
          cursor: cmdOpts.cursor,
        });

        if (opts.json) {
          output(res, { json: true });
          return;
        }

        if (cmdOpts.raw) {
          const rows = res.data.map((c) => ({
            id: c.id,
            user_phone: c.user_phone,
            status: c.status,
            unread_count: c.unread_count,
            last_message: c.last_message?.text || (c.last_message?.has_media ? "[Media]" : "-"),
            updated_at: c.updated_at,
          }));
          output(rows, { columns: ["id", "user_phone", "status", "unread_count", "last_message", "updated_at"] });
          return;
        }

        if (res.data.length === 0) {
          console.log("No iMessage conversations found.");
          return;
        }

        console.log(`\nActive iMessage Conversations (${res.data.length}):\n`);
        for (const c of res.data) {
          const statusBullet = c.status === "connected" ? "●" : "○";
          const statusTag = `[${c.status}]`;
          const unreadTag = c.unread_count > 0 ? ` (${c.unread_count} unread)` : "";
          const timeTag = formatRelativeTime(c.updated_at);
          const preview = c.last_message?.text
            ? `"${c.last_message.text}"`
            : c.last_message?.has_media
            ? "[Media attachment]"
            : "(no messages yet)";

          console.log(`${statusBullet} ${c.user_phone}  ${statusTag}${unreadTag}  ·  ${timeTag}`);
          console.log(`  ID:   ${c.id}`);
          console.log(`  Last: ${preview}\n`);
        }

        if (res.has_more && res.next_cursor) {
          console.log(`Next cursor: ${res.next_cursor}\n`);
        }
      })
    );

  // 3. wirebox imessage disconnect <conversation-id>
  imessage
    .command("disconnect <conversation_id>")
    .description("Disconnect an active iMessage conversation session")
    .action(
      withErrorHandler(async function (this: Command, conversationId: string) {
        const opts = getGlobalOpts(this);
        const client = createClient(opts);

        const res = await client.imessage.conversations.disconnect(conversationId);

        if (opts.json) {
          output(res, { json: true });
        } else {
          console.log(`Conversation '${conversationId}' disconnected successfully.`);
        }
      })
    );

  // 4. wirebox imessage read <conversation_id>
  imessage
    .command("read <conversation_id>")
    .description("Mark every message in an iMessage conversation as read and reset unread count")
    .action(
      withErrorHandler(async function (this: Command, conversationId: string) {
        const opts = getGlobalOpts(this);
        const client = createClient(opts);

        const res = await (client.imessage.conversations as any).read(conversationId);

        if (opts.json) {
          output(res, { json: true });
        } else {
          console.log(`Conversation '${conversationId}' marked as read (unread count: ${res.unread_count}).`);
        }
      })
    );

  // 5. wirebox imessage messages <conversation_id>
  imessage
    .command("messages <conversation_id>")
    .description("Show message history in an iMessage conversation")
    .option("--limit <n>", "Max messages to retrieve", (v) => parseInt(v, 10))
    .option("--cursor <cursor>", "Cursor for pagination")
    .option("--no-mark-read", "Leave unread count and message read markers untouched")
    .option("--raw", "Display table instead of chat visualizer", false)
    .action(
      withErrorHandler(async function (
        this: Command,
        conversationId: string,
        cmdOpts: { limit?: number; cursor?: string; raw?: boolean; markRead?: boolean }
      ) {
        const opts = getGlobalOpts(this);
        const client = createClient(opts);

        const res = await client.imessage.messages.list({
          conversation_id: conversationId,
          limit: cmdOpts.limit,
          cursor: cmdOpts.cursor,
          mark_read: cmdOpts.markRead,
        } as any);

        if (opts.json) {
          output(res, { json: true });
          return;
        }

        if (cmdOpts.raw) {
          output(res.data, { columns: MESSAGE_COLUMNS });
          return;
        }

        if (res.data.length === 0) {
          console.log("No messages in this conversation.");
          return;
        }

        console.log(`\n--- Conversation: ${conversationId} ---`);
        for (const msg of res.data) {
          const timestamp = msg.created_at.slice(0, 19).replace("T", " ");
          const isAgent = msg.direction === "outbound";
          const icon = isAgent ? "🤖 Agent" : `👤 ${msg.sender}`;
          console.log(`[${timestamp}] ${icon}:`);
          if (msg.text) {
            console.log(`  ${msg.text}`);
          }
          if (msg.media_url) {
            console.log(`  📎 [Media]: ${msg.media_url}`);
          }
        }
        console.log("-------------------------------------------\n");

        if (res.has_more && res.next_cursor) {
          console.log(`Next cursor: ${res.next_cursor}`);
        }
      })
    );

  // 5. wirebox imessage send
  imessage
    .command("send")
    .description("Send an outbound iMessage to an active conversation or phone number")
    .option("-c, --conversation <conversation_id>", "Active conversation ID to reply into")
    .option("-t, --to <phone>", "Recipient E.164 phone number (e.g. +16465550123)")
    .option("-i, --identity <handle>", "Agent identity handle (required with --to if using admin key)")
    .option("-m, --text <text>", "Text body of the message")
    .option("--media-url <url>", "Public URL of media attachment to send")
    .action(
      withErrorHandler(async function (
        this: Command,
        cmdOpts: {
          conversation?: string;
          to?: string;
          identity?: string;
          text?: string;
          mediaUrl?: string;
        }
      ) {
        if (!cmdOpts.conversation && !cmdOpts.to) {
          console.error("Error: Pass either --conversation <id> or --to <phone>.");
          process.exit(1);
        }
        if (cmdOpts.conversation && cmdOpts.to) {
          console.error("Error: Pass either --conversation or --to, not both.");
          process.exit(1);
        }
        if (!cmdOpts.text && !cmdOpts.mediaUrl) {
          console.error("Error: Pass either --text or --media-url (or both).");
          process.exit(1);
        }

        const opts = getGlobalOpts(this);
        const client = createClient(opts);

        let identityId: string | undefined;
        if (cmdOpts.identity) {
          const agent = await client.getIdentity(cmdOpts.identity);
          identityId = agent.id;
        }

        const msg = await client.imessage.messages.send({
          conversation_id: cmdOpts.conversation,
          to: cmdOpts.to,
          text: cmdOpts.text,
          media_url: cmdOpts.mediaUrl,
          identity_id: identityId,
        });

        output(
          {
            id: msg.id,
            conversation_id: msg.conversation_id,
            to: msg.to,
            text: msg.text,
            status: msg.status,
            created_at: msg.created_at,
          },
          { json: !!opts.json }
        );
      })
    );
}
