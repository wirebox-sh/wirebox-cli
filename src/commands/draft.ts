/**
 * Wirebox CLI - Email Drafts Commands
 *
 * Provides command-line actions for composing, inspecting, revising, and sending drafts.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import type { CreateDraftParams, SendEmailAttachment, UpdateDraftParams } from "@wirebox-sh/sdk";
import type { Command } from "commander";
import { createClient, getGlobalOpts } from "../client.js";
import { withErrorHandler } from "../errors.js";
import { formatRelativeTime, output, printTable } from "../output.js";

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

export function registerDraftCommands(mailCommand: Command): void {
  const draft = mailCommand
    .command("draft")
    .alias("drafts")
    .description("Draft email management (compose, review, revise, and send)");

  // 1. List drafts
  draft
    .command("list")
    .description("List drafts in an agent identity mailbox")
    .option("-i, --identity <handle>", "Agent identity handle")
    .option("--limit <number>", "Maximum number of drafts to return (default 50)", "50")
    .option("--offset <number>", "Number of drafts to skip (default 0)", "0")
    .action(
      withErrorHandler(async function (
        this: Command,
        cmdOpts: {
          identity?: string;
          limit: string;
          offset: string;
        }
      ) {
        const opts = getGlobalOpts(this);
        const client = createClient(opts);
        const agent = await client.getIdentity(cmdOpts.identity);

        const limit = Number(cmdOpts.limit) || 50;
        const offset = Number(cmdOpts.offset) || 0;

        const res = await agent.listDrafts({ limit, offset });

        if (opts.json) {
          output(res, { json: true });
          return;
        }

        if (!res.drafts || res.drafts.length === 0) {
          console.log(`\nNo drafts found in mailbox (${agent.mailbox?.email_address || agent.agent_handle}).\n`);
          return;
        }

        const rows = res.drafts.map((d) => ({
          id: d.id,
          version: d.version,
          subject: (d.subject || "(no subject)").slice(0, 36),
          to: (d.to || []).join(", ") || "(none)",
          attachments: d.has_attachments ? "yes" : "no",
          updated: formatRelativeTime(d.updated_at),
        }));

        console.log(`\nDrafts for ${agent.mailbox?.email_address || agent.agent_handle} (${res.count} total):\n`);
        printTable(rows, ["id", "version", "subject", "to", "attachments", "updated"]);
        console.log();
      })
    );

  // 2. Get draft detail
  draft
    .command("get <draft-id>")
    .description("Get full details of a specific draft")
    .option("-i, --identity <handle>", "Agent identity handle")
    .action(
      withErrorHandler(async function (
        this: Command,
        draftId: string,
        cmdOpts: { identity?: string }
      ) {
        const opts = getGlobalOpts(this);
        const client = createClient(opts);
        const agent = await client.getIdentity(cmdOpts.identity);

        const d = await agent.getDraft(draftId);

        if (opts.json) {
          output(d, { json: true });
          return;
        }

        console.log(`\nDraft Details (${d.id}):\n`);
        console.log(`  ID:          ${d.id}`);
        console.log(`  Version:     ${d.version}`);
        console.log(`  Status:      ${d.status}`);
        if (d.thread_id) console.log(`  Thread ID:   ${d.thread_id}`);
        if (d.in_reply_to_message_id) console.log(`  In-Reply-To: ${d.in_reply_to_message_id}`);
        if (d.forward_of_message_id) console.log(`  Forward-Of:  ${d.forward_of_message_id}`);
        console.log(`  From:        ${agent.mailbox?.email_address || "-"}`);
        console.log(`  To:          ${d.to.length > 0 ? d.to.join(", ") : "(none)"}`);
        if (d.cc && d.cc.length > 0) console.log(`  CC:          ${d.cc.join(", ")}`);
        if (d.bcc && d.bcc.length > 0) console.log(`  BCC:         ${d.bcc.join(", ")}`);
        console.log(`  Subject:     ${d.subject || "(no subject)"}`);
        console.log(`  Updated:     ${d.updated_at}`);

        if (d.attachments && d.attachments.length > 0) {
          console.log(`\n  Attachments (${d.attachments.length}):`);
          for (const att of d.attachments) {
            console.log(`    - ${att.filename} (${att.content_type}, ${att.size_bytes} bytes) [${att.id}]`);
            if (att.url) {
              console.log(`      Download: ${att.url}`);
            }
          }
        }

        if (d.text) {
          console.log(`\n  --- Text Content ---\n${d.text}\n`);
        } else if (d.html) {
          console.log(`\n  --- HTML Content (Preview) ---\n${d.snippet || "(html body)"}\n`);
        }
      })
    );

  // 3. Create draft
  draft
    .command("create")
    .description("Create a new email draft (plain, reply, or forward)")
    .option("-i, --identity <handle>", "Agent identity handle")
    .option("--to <addresses>", "Comma-separated recipient addresses")
    .option("--subject <subject>", "Email subject line")
    .option("--text <body>", "Plain text draft body")
    .option("--html <html>", "Rich HTML draft body")
    .option("--cc <addresses>", "Comma-separated CC addresses")
    .option("--bcc <addresses>", "Comma-separated BCC addresses")
    .option("--reply-to <message-id>", "Parent message ID to reply to")
    .option("--reply-all", "Reply to all recipients of the parent message")
    .option("--forward-of <message-id>", "Parent message ID to forward")
    .option("--no-forward-attachments", "Do not copy attachments from the forwarded message")
    .option("--attach <path>", "Attach a file (repeatable)", collect, [])
    .action(
      withErrorHandler(async function (
        this: Command,
        cmdOpts: {
          identity?: string;
          to?: string;
          subject?: string;
          text?: string;
          html?: string;
          cc?: string;
          bcc?: string;
          replyTo?: string;
          replyAll?: boolean;
          forwardOf?: string;
          forwardAttachments?: boolean;
          attach: string[];
        }
      ) {
        const opts = getGlobalOpts(this);
        const client = createClient(opts);
        const agent = await client.getIdentity(cmdOpts.identity);

        const attachments =
          cmdOpts.attach.length > 0 ? resolveAttachments(cmdOpts.attach) : undefined;

        const payload: CreateDraftParams = {
          to: cmdOpts.to ? cmdOpts.to.split(",").map((s) => s.trim()) : undefined,
          subject: cmdOpts.subject,
          text: cmdOpts.text,
          html: cmdOpts.html,
          cc: cmdOpts.cc ? cmdOpts.cc.split(",").map((s) => s.trim()) : undefined,
          bcc: cmdOpts.bcc ? cmdOpts.bcc.split(",").map((s) => s.trim()) : undefined,
          in_reply_to: cmdOpts.replyTo,
          reply_all: cmdOpts.replyAll,
          forward_of: cmdOpts.forwardOf,
          forward_attachments: cmdOpts.forwardAttachments !== false,
          attachments,
        };

        const res = await agent.createDraft(payload);

        if (opts.json) {
          output(res, { json: true });
          return;
        }

        console.log(`\nDraft created successfully:\n`);
        console.log(`  ID:          ${res.id}`);
        console.log(`  Version:     ${res.version}`);
        console.log(`  Status:      ${res.status}`);
        console.log(`  Subject:     ${res.subject || "(no subject)"}`);
        console.log(`  To:          ${res.to.length > 0 ? res.to.join(", ") : "(none)"}`);
        console.log(`  Attachments: ${res.has_attachments ? `${res.attachments.length} attached` : "none"}`);
        console.log();
      })
    );

  // 4. Update draft
  draft
    .command("update <draft-id>")
    .description("Update an existing email draft")
    .option("-i, --identity <handle>", "Agent identity handle")
    .option("--expected-version <number>", "Expected version for optimistic concurrency control")
    .option("--draft-version <number>", "Alias for --expected-version")
    .option("--to <addresses>", "Comma-separated recipient addresses")
    .option("--subject <subject>", "Email subject line")
    .option("--text <body>", "Plain text body")
    .option("--html <html>", "HTML body")
    .option("--cc <addresses>", "Comma-separated CC addresses")
    .option("--bcc <addresses>", "Comma-separated BCC addresses")
    .option("--clear-to", "Clear all To recipients")
    .option("--clear-cc", "Clear all CC recipients")
    .option("--clear-bcc", "Clear all BCC recipients")
    .option("--clear-subject", "Clear subject line")
    .option("--clear-text", "Clear plain text body")
    .option("--clear-html", "Clear HTML body")
    .option("--attach <path>", "Append a file attachment (repeatable)", collect, [])
    .option("--remove-attach <att-id>", "Remove an attachment by ID (repeatable)", collect, [])
    .action(
      withErrorHandler(async function (
        this: Command,
        draftId: string,
        cmdOpts: {
          identity?: string;
          expectedVersion?: string;
          draftVersion?: string;
          to?: string;
          subject?: string;
          text?: string;
          html?: string;
          cc?: string;
          bcc?: string;
          clearTo?: boolean;
          clearCc?: boolean;
          clearBcc?: boolean;
          clearSubject?: boolean;
          clearText?: boolean;
          clearHtml?: boolean;
          attach: string[];
          removeAttach: string[];
        }
      ) {
        const opts = getGlobalOpts(this);
        const client = createClient(opts);
        const agent = await client.getIdentity(cmdOpts.identity);

        const addAttachments =
          cmdOpts.attach.length > 0 ? resolveAttachments(cmdOpts.attach) : undefined;

        const rawVer = cmdOpts.expectedVersion || cmdOpts.draftVersion;
        const version = rawVer ? Number(rawVer) : undefined;

        const payload: UpdateDraftParams = {
          version,
          to: cmdOpts.clearTo ? null : cmdOpts.to ? cmdOpts.to.split(",").map((s) => s.trim()) : undefined,
          cc: cmdOpts.clearCc ? null : cmdOpts.cc ? cmdOpts.cc.split(",").map((s) => s.trim()) : undefined,
          bcc: cmdOpts.clearBcc ? null : cmdOpts.bcc ? cmdOpts.bcc.split(",").map((s) => s.trim()) : undefined,
          subject: cmdOpts.clearSubject ? null : cmdOpts.subject,
          text: cmdOpts.clearText ? null : cmdOpts.text,
          html: cmdOpts.clearHtml ? null : cmdOpts.html,
          add_attachments: addAttachments,
          remove_attachments: cmdOpts.removeAttach.length > 0 ? cmdOpts.removeAttach : undefined,
        };

        const res = await agent.updateDraft(draftId, payload);

        if (opts.json) {
          output(res, { json: true });
          return;
        }

        console.log(`\nDraft '${draftId}' updated successfully:\n`);
        console.log(`  Version:     ${res.version}`);
        console.log(`  Subject:     ${res.subject || "(no subject)"}`);
        console.log(`  To:          ${res.to.length > 0 ? res.to.join(", ") : "(none)"}`);
        console.log(`  Attachments: ${res.has_attachments ? `${res.attachments.length} attached` : "none"}`);
        console.log(`  Updated:     ${res.updated_at}`);
        console.log();
      })
    );

  // 5. Send draft
  draft
    .command("send <draft-id>")
    .description("Send an email draft and convert it into a permanent sent message")
    .option("-i, --identity <handle>", "Agent identity handle")
    .option("--expected-version <number>", "Draft version required for optimistic concurrency check")
    .option("--draft-version <number>", "Alias for --expected-version")
    .option("--idempotency-key <key>", "Unique idempotency token to avoid duplicate sends")
    .option("--to <addresses>", "Override recipient addresses")
    .option("--subject <subject>", "Override subject line")
    .option("--text <body>", "Override plain text body")
    .action(
      withErrorHandler(async function (
        this: Command,
        draftId: string,
        cmdOpts: {
          identity?: string;
          expectedVersion?: string;
          draftVersion?: string;
          idempotencyKey?: string;
          to?: string;
          subject?: string;
          text?: string;
        }
      ) {
        const opts = getGlobalOpts(this);
        const client = createClient(opts);
        const agent = await client.getIdentity(cmdOpts.identity);

        const overrides =
          cmdOpts.to || cmdOpts.subject || cmdOpts.text
            ? {
                to: cmdOpts.to ? cmdOpts.to.split(",").map((s) => s.trim()) : undefined,
                subject: cmdOpts.subject,
                text: cmdOpts.text,
              }
            : undefined;

        const sendVer = cmdOpts.expectedVersion || cmdOpts.draftVersion;
        const res = await agent.sendDraft(draftId, {
          version: sendVer ? Number(sendVer) : undefined,
          idempotencyKey: cmdOpts.idempotencyKey,
          overrides,
        });

        if (opts.json) {
          output(res, { json: true });
          return;
        }

        console.log(`\nDraft '${draftId}' dispatched successfully:\n`);
        console.log(`  Message ID:  ${res.id}`);
        console.log(`  Thread ID:   ${res.thread_id}`);
        console.log(`  Status:      ${res.status}`);
        console.log();
      })
    );

  // 6. Delete draft
  draft
    .command("delete <draft-id>")
    .description("Permanently delete an email draft")
    .option("-i, --identity <handle>", "Agent identity handle")
    .action(
      withErrorHandler(async function (
        this: Command,
        draftId: string,
        cmdOpts: { identity?: string }
      ) {
        const opts = getGlobalOpts(this);
        const client = createClient(opts);
        const agent = await client.getIdentity(cmdOpts.identity);

        const res = await agent.deleteDraft(draftId);

        if (opts.json) {
          output(res, { json: true });
        } else {
          console.log(`Draft '${draftId}' deleted successfully.`);
        }
      })
    );
}
