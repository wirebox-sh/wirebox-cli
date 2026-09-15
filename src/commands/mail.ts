/**
 * Wirebox CLI - Mail Communication Commands
 */

import * as fs from "node:fs";
import * as path from "node:path";
import type { SendEmailAttachment } from "@wirebox-sh/sdk";
import type { Command } from "commander";
import { createClient, getGlobalOpts } from "../client.js";
import { withErrorHandler } from "../errors.js";
import { output } from "../output.js";

const MESSAGE_COLUMNS = [
  "id",
  "direction",
  "from_address",
  "subject",
  "status",
  "created_at",
];

function collect(val: string, prev: string[]): string[] {
  prev.push(val);
  return prev;
}

function resolveAttachments(paths: string[]): SendEmailAttachment[] {
  return paths.map((filePath) => {
    const filename = path.basename(filePath);
    const buffer = fs.readFileSync(filePath);
    const content = buffer.toString("base64");

    const ext = path.extname(filePath).toLowerCase();
    let content_type = "application/octet-stream";
    if (ext === ".pdf") content_type = "application/pdf";
    else if (ext === ".png") content_type = "image/png";
    else if (ext === ".jpg" || ext === ".jpeg") content_type = "image/jpeg";
    else if (ext === ".txt") content_type = "text/plain";
    else if (ext === ".json") content_type = "application/json";

    return {
      filename,
      content_type,
      content,
    };
  });
}

export function registerMailCommands(program: Command): void {
  const mail = program
    .command("mail")
    .description("Real-world email communications for agent identities");

  mail
    .command("send")
    .description("Send an email from an agent identity mailbox")
    .option("-i, --identity <handle>", "Agent identity handle (defaults to scoped identity)")
    .requiredOption("--to <addresses>", "Comma-separated recipient addresses")
    .requiredOption("--subject <subject>", "Email subject line")
    .requiredOption("--text <body>", "Plain text email body")
    .option("--html <html>", "Rich HTML formatted body")
    .option("--cc <addresses>", "Comma-separated CC addresses")
    .option("--bcc <addresses>", "Comma-separated BCC addresses")
    .option("--attach <path>", "Attach a file (repeatable)", collect, [])
    .action(
      withErrorHandler(async function (
        this: Command,
        cmdOpts: {
          identity?: string;
          to: string;
          subject: string;
          text: string;
          html?: string;
          cc?: string;
          bcc?: string;
          attach: string[];
        }
      ) {
        const opts = getGlobalOpts(this);
        const client = createClient(opts);
        const agent = await client.getIdentity(cmdOpts.identity);

        const attachments =
          cmdOpts.attach.length > 0 ? resolveAttachments(cmdOpts.attach) : undefined;

        const res = await agent.sendEmail({
          to: cmdOpts.to.split(",").map((s) => s.trim()),
          subject: cmdOpts.subject,
          text: cmdOpts.text,
          html: cmdOpts.html,
          cc: cmdOpts.cc ? cmdOpts.cc.split(",").map((s) => s.trim()) : undefined,
          bcc: cmdOpts.bcc ? cmdOpts.bcc.split(",").map((s) => s.trim()) : undefined,
          attachments,
        });

        output(
          {
            message_id: res.message_id,
            from: res.mailbox_address,
            status: res.status,
            created_at: res.created_at,
          },
          { json: !!opts.json }
        );
      })
    );

  mail
    .command("list")
    .description("List messages in an agent identity mailbox")
    .option("-i, --identity <handle>", "Agent identity handle")
    .option("--limit <n>", "Max messages per page", (v) => parseInt(v, 10))
    .option("--offset <n>", "Pagination offset", (v) => parseInt(v, 10))
    .option("--status <status>", "Filter by status: queued, sent, delivered, bounced, failed")
    .action(
      withErrorHandler(async function (
        this: Command,
        cmdOpts: {
          identity?: string;
          limit?: number;
          offset?: number;
          status?: "queued" | "sent" | "delivered" | "bounced" | "failed";
        }
      ) {
        const opts = getGlobalOpts(this);
        const client = createClient(opts);
        const agent = await client.getIdentity(cmdOpts.identity);
        const res = await agent.listMessages({
          limit: cmdOpts.limit,
          offset: cmdOpts.offset,
          status: cmdOpts.status,
        });

        if (opts.json) {
          output(res, { json: true });
          return;
        }

        const rows = res.messages.map((m) => ({
          id: m.id,
          direction: m.direction,
          from_address: m.from_address,
          subject: m.subject,
          status: m.status,
          created_at: m.created_at.slice(0, 19).replace("T", " "),
        }));

        output(rows, { columns: MESSAGE_COLUMNS });
      })
    );

  mail
    .command("get <message-id>")
    .description("Retrieve full email content (headers, body text, HTML, attachments)")
    .option("-i, --identity <handle>", "Agent identity handle")
    .action(
      withErrorHandler(async function (this: Command, messageId: string, cmdOpts: { identity?: string }) {
        const opts = getGlobalOpts(this);
        const client = createClient(opts);
        const agent = await client.getIdentity(cmdOpts.identity);
        const email = await agent.getMessage(messageId);

        if (opts.json) {
          output(email, { json: true });
          return;
        }

        output({
          "Message ID": email.id,
          "Direction": email.direction,
          "From": email.from_address,
          "To": email.to_addresses.join(", "),
          "CC": email.cc_addresses.join(", ") || "-",
          "Subject": email.subject,
          "Status": email.status,
          "Created At": email.created_at,
          "Attachments": email.attachments.map((a) => a.filename).join(", ") || "None",
          "Body (Text)": email.text || "(empty)",
        });
      })
    );

  mail
    .command("reply <message-id>")
    .description("Reply to an email, preserving thread context and RFC headers")
    .option("-i, --identity <handle>", "Agent identity handle")
    .requiredOption("--text <body>", "Plain text response body")
    .option("--html <html>", "Rich HTML response body")
    .action(
      withErrorHandler(async function (
        this: Command,
        messageId: string,
        cmdOpts: { identity?: string; text: string; html?: string }
      ) {
        const opts = getGlobalOpts(this);
        const client = createClient(opts);
        const agent = await client.getIdentity(cmdOpts.identity);
        const res = await agent.replyEmail(messageId, {
          text: cmdOpts.text,
          html: cmdOpts.html,
        });

        output(
          {
            message_id: res.message_id,
            from: res.mailbox_address,
            status: res.status,
            created_at: res.created_at,
          },
          { json: !!opts.json }
        );
      })
    );

  mail
    .command("delete <message-id>")
    .description("Delete an email message from the mailbox")
    .option("-i, --identity <handle>", "Agent identity handle")
    .action(
      withErrorHandler(async function (this: Command, messageId: string, cmdOpts: { identity?: string }) {
        const opts = getGlobalOpts(this);
        const client = createClient(opts);
        const agent = await client.getIdentity(cmdOpts.identity);
        const res = await agent.deleteMessage(messageId);

        if (opts.json) {
          output(res, { json: true });
        } else {
          console.log(`Message '${messageId}' deleted successfully.`);
        }
      })
    );
}
