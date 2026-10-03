/**
 * Wirebox CLI - Mail Communication Commands
 */

import * as fs from "node:fs";
import * as path from "node:path";
import type { SendEmailAttachment } from "@wirebox-sh/sdk";
import type { Command } from "commander";
import { createClient, getGlobalOpts } from "../client.js";
import { withErrorHandler } from "../errors.js";
import { output, formatRelativeTime } from "../output.js";

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

        if (opts.json) {
          output(res, { json: true });
          return;
        }

        const messageId = res.id || (res as any).message_id || "-";
        const threadId = res.thread_id || "-";
        const fromAddress = res.mailbox_address || agent.mailbox?.email_address || "-";

        console.log("\nEmail dispatched successfully:\n");
        console.log(`  ID:          ${messageId}`);
        if (threadId !== "-") {
          console.log(`  Thread ID:   ${threadId}`);
        }
        console.log(`  From:        ${fromAddress}`);
        console.log(`  To:          ${cmdOpts.to}`);
        if (cmdOpts.cc) {
          console.log(`  CC:          ${cmdOpts.cc}`);
        }
        console.log(`  Subject:     ${cmdOpts.subject}`);
        if (attachments && attachments.length > 0) {
          console.log(`  Attachments: ${attachments.map((a) => a.filename).join(", ")}`);
        }
        console.log(`  Status:      Sent`);
        console.log();
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

        const messages = res.messages || [];
        if (messages.length === 0) {
          console.log("No messages in mailbox.");
          return;
        }

        console.log();
        for (const m of messages) {
          const isOutbound = m.direction === "outbound";
          const dirTag = isOutbound ? "▲ OUTBOUND" : "▼ INBOUND ";
          const targetLabel = isOutbound ? "To:     " : "From:   ";
          const targetValue = isOutbound
            ? (Array.isArray(m.to) ? m.to.join(", ") : (m.to_addresses ? m.to_addresses.join(", ") : "-"))
            : (m.from || m.from_address || "-");
          const created = formatRelativeTime(m.created_at);

          console.log(`  ${dirTag}  ${m.id}`);
          console.log(`    ${targetLabel} ${targetValue}`);
          console.log(`    Subject: ${m.subject || "(no subject)"}`);
          if (m.snippet) {
            console.log(`    Snippet: ${m.snippet.slice(0, 100)}`);
          }
          console.log(`    Date:    ${created}`);
          console.log();
        }

        const countStr = messages.length === 1 ? "1 message" : `${messages.length} messages`;
        console.log(`${countStr} in mailbox. Run 'wirebox mail get <message-id>' to view contents.\n`);
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

        const toList = email.to || email.to_addresses || [];
        const toStr = Array.isArray(toList) ? toList.join(", ") : String(toList);

        const ccList = email.cc || email.cc_addresses || [];
        const ccStr = Array.isArray(ccList) && ccList.length > 0 ? ccList.join(", ") : undefined;

        const bccList = email.bcc || email.bcc_addresses || [];
        const bccStr = Array.isArray(bccList) && bccList.length > 0 ? bccList.join(", ") : undefined;

        const fromStr = email.from || email.from_address || "-";
        const dirTag = email.direction === "outbound" ? "▲ OUTBOUND" : "▼ INBOUND ";
        const attachStr = email.attachments && email.attachments.length > 0
          ? email.attachments.map((a: any) => `${a.filename} (${a.content_type || "attachment"})`).join(", ")
          : undefined;

        console.log();
        console.log(`  ${dirTag}  ${email.id}`);
        console.log(`  From:        ${fromStr}`);
        console.log(`  To:          ${toStr}`);
        if (ccStr) console.log(`  CC:          ${ccStr}`);
        if (bccStr) console.log(`  BCC:         ${bccStr}`);
        console.log(`  Subject:     ${email.subject || "(no subject)"}`);
        console.log(`  Date:        ${formatRelativeTime(email.created_at)} (${email.created_at ? email.created_at.slice(0, 19).replace("T", " ") : "-"})`);
        if (attachStr) console.log(`  Attachments: ${attachStr}`);
        if (email.thread_id) console.log(`  Thread ID:   ${email.thread_id}`);
        console.log();
        console.log("  ------------------------------ Message Body ------------------------------");
        console.log();
        if (email.text) {
          console.log(email.text);
        } else if (email.html) {
          console.log(email.html);
        } else {
          console.log("  (no text content)");
        }
        console.log();
        console.log("  --------------------------------------------------------------------------");
        console.log();
        console.log(`💡 Next step:`);
        console.log(`  - Reply to this message: wirebox mail reply ${email.id} --text "Your reply here"`);
        console.log();
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

        if (opts.json) {
          output(res, { json: true });
          return;
        }

        const replyId = (res as any).id || res.message_id || "-";
        const threadId = (res as any).thread_id || "-";

        console.log(`\nReply sent successfully:\n`);
        console.log(`  ID:          ${replyId}`);
        if (threadId !== "-") {
          console.log(`  Thread ID:   ${threadId}`);
        }
        console.log(`  In Reply To: ${messageId}`);
        console.log(`  From:        ${agent.mailbox?.email_address || res.mailbox_address || "-"}`);
        console.log(`  Status:      Sent`);
        console.log();
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
