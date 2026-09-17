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
    .action(
      withErrorHandler(async function (
        this: Command,
        cmdOpts: { identity?: string; status?: "connected" | "disconnected"; limit?: number; cursor?: string }
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

        const rows = res.data.map((c) => ({
          id: c.id,
          identity_id: c.identity_id,
          user_phone: c.user_phone,
          status: c.status,
          unread_count: c.unread_count,
          last_message: c.last_message?.text || (c.last_message?.has_media ? "[Media]" : "-"),
          updated_at: c.updated_at,
        }));

        output(rows, { columns: CONVERSATION_COLUMNS });
        if (res.has_more && res.next_cursor) {
          console.log(`\nNext cursor: ${res.next_cursor}`);
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

  // 4. wirebox imessage messages <conversation_id>
  imessage
    .command("messages <conversation_id>")
    .description("Show message history in an iMessage conversation")
    .option("--limit <n>", "Max messages to retrieve", (v) => parseInt(v, 10))
    .option("--cursor <cursor>", "Cursor for pagination")
    .option("--raw", "Display table instead of chat visualizer", false)
    .action(
      withErrorHandler(async function (
        this: Command,
        conversationId: string,
        cmdOpts: { limit?: number; cursor?: string; raw?: boolean }
      ) {
        const opts = getGlobalOpts(this);
        const client = createClient(opts);

        const res = await client.imessage.messages.list({
          conversation_id: conversationId,
          limit: cmdOpts.limit,
          cursor: cmdOpts.cursor,
        });

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

  // 6. wirebox imessage users (gateway user allowlist)
  const users = imessage
    .command("users")
    .description("Manage iMessage gateway registered users and line routing");

  users
    .command("list")
    .description("List registered phone numbers on iMessage gateway")
    .action(
      withErrorHandler(async function (this: Command) {
        const opts = getGlobalOpts(this);
        const client = createClient(opts);
        const res = await client.imessage.users.list();
        output(res.data, {
          json: !!opts.json,
          columns: ["id", "phone_number", "assigned_router_number", "created_at"],
        });
      })
    );

  users
    .command("add <phone>")
    .description("Pre-provision a phone number on the gateway")
    .action(
      withErrorHandler(async function (this: Command, phone: string) {
        const opts = getGlobalOpts(this);
        const client = createClient(opts);
        const res = await client.imessage.users.add(phone);
        output(res, { json: !!opts.json });
      })
    );

  users
    .command("remove <phone>")
    .description("Remove a phone number from the gateway")
    .action(
      withErrorHandler(async function (this: Command, phone: string) {
        const opts = getGlobalOpts(this);
        const client = createClient(opts);
        const res = await client.imessage.users.remove(phone);
        output(res, { json: !!opts.json });
      })
    );
}
