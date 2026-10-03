/**
 * Wirebox CLI - Webhook Management Commands
 *
 * Provides commands to list, inspect, configure, test, rotate secrets,
 * and locally verify cryptographic signatures for Wirebox webhooks.
 */

import { readFileSync } from "node:fs";
import { verifyWebhook } from "@wirebox-sh/sdk";
import type { CreateWebhookParams, UpdateWebhookParams, WebhookStatus } from "@wirebox-sh/sdk";
import type { Command } from "commander";
import { createClient, getGlobalOpts } from "../client.js";
import { withErrorHandler } from "../errors.js";
import { output, formatRelativeTime } from "../output.js";

async function readStdin(): Promise<string> {
  return new Promise((resolve) => {
    let data = "";
    process.stdin.setEncoding("utf-8");
    process.stdin.on("readable", () => {
      let chunk: string | null;
      while ((chunk = process.stdin.read()) !== null) {
        data += chunk;
      }
    });
    process.stdin.on("end", () => resolve(data));
  });
}

export function registerWebhookCommands(program: Command): void {
  function attachWebhookSubcommands(parent: Command) {
    parent
      .command("list")
      .description("List webhook subscriptions in your organization")
      .option("--agent <handle>", "Filter by agent handle (e.g. sales-bot)")
      .option("--mailbox <email>", "Filter by mailbox address or ID")
      .option("--event <event>", "Filter by subscribed event (e.g. email.received, sms.received)")
      .option("--limit <n>", "Maximum records to return", (v) => parseInt(v, 10))
      .option("--offset <n>", "Pagination offset", (v) => parseInt(v, 10))
      .action(
        withErrorHandler(async function (
          this: Command,
          cmdOpts: {
            agent?: string;
            mailbox?: string;
            event?: string;
            limit?: number;
            offset?: number;
          }
        ) {
          const opts = getGlobalOpts(this);
          const client = createClient(opts);

          const webhooks = await client.webhooks.list({
            agent: cmdOpts.agent,
            mailbox: cmdOpts.mailbox,
            event: cmdOpts.event,
            limit: cmdOpts.limit,
            offset: cmdOpts.offset,
          });

          if (opts.json) {
            output({ webhooks }, { json: true });
            return;
          }

          if (webhooks.length === 0) {
            console.log("No webhooks configured.");
            return;
          }

          console.log();
          for (const w of webhooks) {
            const status = (w.status || "active").toLowerCase();
            const statusUpper = status.toUpperCase();
            const statusBullet = status === "active" ? "●" : "○";
            const agentTag = w.agent_handle ? ` (@${w.agent_handle.replace(/^@/, "")})` : "";
            const eventsStr = Array.isArray(w.events)
              ? (w.events.length === 1 && w.events[0] === "*" ? "* (all events)" : w.events.join(", "))
              : String(w.events);
            const created = formatRelativeTime(w.created_at);

            console.log(`  ${statusBullet} ${statusUpper.padEnd(7)}  ${w.id}${agentTag}`);
            console.log(`    URL:     ${w.url}`);
            console.log(`    Events:  ${eventsStr}`);
            console.log(`    Created: ${created}`);
            console.log();
          }

          const countStr = webhooks.length === 1 ? "1 webhook" : `${webhooks.length} webhooks`;
          console.log(`${countStr} configured. Run 'wirebox webhook test <id>' to ping an endpoint.\n`);
        })
      );

    parent
      .command("view <id>")
      .aliases(["info", "show"])
      .description("View full details and status for a specific webhook endpoint")
      .action(
        withErrorHandler(async function (this: Command, id: string) {
          const opts = getGlobalOpts(this);
          const client = createClient(opts);
          const webhook = await client.webhooks.get(id);

          if (opts.json) {
            output(webhook, { json: true });
            return;
          }

          const status = (webhook.status || "active").toLowerCase();
          const statusUpper = status.toUpperCase();
          const statusBullet = status === "active" ? "●" : "○";
          const eventsStr = Array.isArray(webhook.events)
            ? (webhook.events.length === 1 && webhook.events[0] === "*" ? "* (all events)" : webhook.events.join(", "))
            : String(webhook.events);
          const agentDisplay = webhook.agent_handle
            ? `@${webhook.agent_handle.replace(/^@/, "")}`
            : "-";

          console.log();
          console.log(`  ${statusBullet} Webhook Endpoint Details`);
          console.log(`  ID:              ${webhook.id}`);
          console.log(`  Status:          ${statusUpper}`);
          console.log(`  Agent Handle:    ${agentDisplay}`);
          if (webhook.mailbox_address) {
            console.log(`  Mailbox:         ${webhook.mailbox_address}`);
          }
          console.log(`  Destination URL: ${webhook.url}`);
          console.log(`  Events:          ${eventsStr}`);
          console.log(`  Auth Token:      ${webhook.has_auth_token ? "Bearer configured (hidden)" : "None"}`);
          console.log(`  Created:         ${formatRelativeTime(webhook.created_at)} (${webhook.created_at ? webhook.created_at.slice(0, 19).replace("T", " ") : "-"})`);
          if (webhook.updated_at && webhook.updated_at !== webhook.created_at) {
            console.log(`  Updated:         ${formatRelativeTime(webhook.updated_at)} (${webhook.updated_at.slice(0, 19).replace("T", " ")})`);
          }
          console.log();
          console.log(`💡 Next steps:`);
          console.log(`  - Test receiver connectivity:  wirebox webhook test ${webhook.id}`);
          console.log(`  - Rotate signing secret:       wirebox webhook rotate-secret ${webhook.id}`);
          console.log();
        })
      );

    parent
      .command("create")
      .description("Create a new webhook subscription for real-time agent notifications")
      .requiredOption("--url <url>", "Destination webhook endpoint URL (HTTPS required in prod)")
      .option(
        "--events <events>",
        "Comma-separated list of events to subscribe to (default: *)",
        "*"
      )
      .option("--agent <handle>", "Scope webhook to a specific agent handle (e.g. sales-bot)")
      .option("--mailbox <email-or-id>", "Scope webhook to a specific mailbox ID or email")
      .option("--auth-token <token>", "Custom secret token passed in Authorization: Bearer <token>")
      .action(
        withErrorHandler(async function (
          this: Command,
          cmdOpts: {
            url: string;
            events?: string;
            agent?: string;
            mailbox?: string;
            authToken?: string;
          }
        ) {
          const opts = getGlobalOpts(this);
          const client = createClient(opts);

          const eventList = (cmdOpts.events || "*")
            .split(",")
            .map((e) => e.trim())
            .filter(Boolean);

          const params: CreateWebhookParams = {
            url: cmdOpts.url,
            events: eventList,
            agent: cmdOpts.agent,
            mailbox: cmdOpts.mailbox,
            auth_token: cmdOpts.authToken,
          };

          const created = await client.webhooks.create(params);

          if (opts.json) {
            output(created, { json: true });
            return;
          }

          console.log("\nWebhook endpoint created successfully:\n");
          output({
            id: created.id,
            agent_handle: created.agent_handle || "-",
            url: created.url,
            events: Array.isArray(created.events) ? created.events.join(", ") : created.events,
            status: created.status,
            secret: created.secret,
            created_at: created.created_at,
          });
          console.log(
            "\n⚠️  IMPORTANT: Save your webhook signing secret now! Wirebox will not show it again.\n"
          );
        })
      );

    parent
      .command("update <id>")
      .description("Update an existing webhook's URL, subscribed events, or status")
      .option("--url <url>", "New destination URL")
      .option("--events <events>", "Comma-separated list of new events")
      .option("--status <status>", "New administrative status: 'active' or 'paused'")
      .option("--auth-token <token>", "Update custom Authorization header token")
      .action(
        withErrorHandler(async function (
          this: Command,
          id: string,
          cmdOpts: {
            url?: string;
            events?: string;
            status?: string;
            authToken?: string;
          }
        ) {
          const opts = getGlobalOpts(this);
          const client = createClient(opts);

          const updateParams: UpdateWebhookParams = {};
          if (cmdOpts.url) updateParams.url = cmdOpts.url;
          if (cmdOpts.status) {
            const normalizedStatus = cmdOpts.status.toLowerCase();
            if (normalizedStatus === "active" || normalizedStatus === "paused") {
              updateParams.status = normalizedStatus as WebhookStatus;
            } else if (normalizedStatus === "disabled" || normalizedStatus === "inactive") {
              updateParams.status = "paused";
            } else {
              throw new Error("Invalid status. Expected 'active' or 'paused'.");
            }
          }
          if (cmdOpts.authToken !== undefined) updateParams.auth_token = cmdOpts.authToken;
          if (cmdOpts.events) {
            updateParams.events = cmdOpts.events
              .split(",")
              .map((e) => e.trim())
              .filter(Boolean);
          }

          const updated = await client.webhooks.update(id, updateParams);

          if (opts.json) {
            output(updated, { json: true });
            return;
          }

          const eventsStr = Array.isArray(updated.events)
            ? (updated.events.length === 1 && updated.events[0] === "*" ? "* (all events)" : updated.events.join(", "))
            : String(updated.events);

          console.log(`\nWebhook '${updated.id}' updated successfully:\n`);
          output({
            id: updated.id,
            status: updated.status?.toUpperCase() || "ACTIVE",
            agent_handle: updated.agent_handle ? `@${updated.agent_handle.replace(/^@/, "")}` : "-",
            url: updated.url,
            events: eventsStr,
            updated_at: `${formatRelativeTime(updated.updated_at)} (${updated.updated_at ? updated.updated_at.slice(0, 19).replace("T", " ") : "-"})`,
          });
          console.log();
        })
      );

    parent
      .command("delete <id>")
      .description("Permanently delete a webhook subscription")
      .action(
        withErrorHandler(async function (this: Command, id: string) {
          const opts = getGlobalOpts(this);
          const client = createClient(opts);

          await client.webhooks.delete(id);

          if (opts.json) {
            output({ success: true, deleted_id: id }, { json: true });
          } else {
            console.log(`Webhook '${id}' deleted successfully.`);
          }
        })
      );

    parent
      .command("test <id>")
      .alias("ping")
      .description("Send an immediate test.ping event to verify webhook receiver connectivity")
      .action(
        withErrorHandler(async function (this: Command, id: string) {
          const opts = getGlobalOpts(this);
          const client = createClient(opts);

          const result = await client.webhooks.test(id);

          if (opts.json) {
            output(result, { json: true });
            return;
          }

          console.log(`\nTest ping sent to webhook '${id}':\n`);
          output({
            success: result.success ? "YES (2xx OK)" : "NO (Failed)",
            event: result.event_type,
            status_code: result.status_code ?? "-",
            latency: `${result.latency_ms}ms`,
            error: result.error || "-",
          });
        })
      );

    parent
      .command("rotate-secret <id>")
      .description("Rotate the HMAC signing secret for a webhook (invalidates previous secret)")
      .action(
        withErrorHandler(async function (this: Command, id: string) {
          const opts = getGlobalOpts(this);
          const client = createClient(opts);

          const result = await client.webhooks.rotateSecret(id);

          if (opts.json) {
            output(result, { json: true });
            return;
          }

          console.log(`\nWebhook secret rotated successfully for '${id}':\n`);
          output({
            id: result.id,
            secret: result.secret,
            updated_at: result.updated_at,
          });
          console.log(
            "\n⚠️  WARNING: Previous secret is invalidated immediately. Update your receiving server!\n"
          );
        })
      );

    parent
      .command("verify-signature")
      .alias("check-signature")
      .description("Verify the HMAC-SHA256 signature of a received webhook payload locally")
      .option("--payload <string>", "Raw payload JSON string")
      .option("--payload-file <file>", "Path to file containing raw JSON payload")
      .requiredOption("--signature <sig>", "The x-wirebox-signature header value")
      .requiredOption("--secret <secret>", "Webhook signing secret (whsec_...)")
      .option("--request-id <id>", "The x-wirebox-request-id header value (req_...)")
      .option("--timestamp <ts>", "Optional explicit unix timestamp or ISO string")
      .option("--tolerance <seconds>", "Tolerance window in seconds (default: 300, 0 to disable)", (v) =>
        parseInt(v, 10)
      )
      .action(
        withErrorHandler(async function (
          this: Command,
          cmdOpts: {
            payload?: string;
            payloadFile?: string;
            signature: string;
            secret: string;
            requestId?: string;
            timestamp?: string;
            tolerance?: number;
          }
        ) {
          const opts = getGlobalOpts(this);

          let payload = cmdOpts.payload;
          if (!payload && cmdOpts.payloadFile) {
            payload = readFileSync(cmdOpts.payloadFile, "utf-8");
          } else if (!payload && !process.stdin.isTTY) {
            payload = await readStdin();
          }

          if (!payload) {
            throw new Error("Missing payload. Provide --payload, --payload-file, or pipe payload via stdin.");
          }

          const headers: Record<string, string> = {
            "x-wirebox-signature": cmdOpts.signature,
          };
          if (cmdOpts.timestamp) {
            headers["x-wirebox-timestamp"] = cmdOpts.timestamp;
          }
          if (cmdOpts.requestId) {
            headers["x-wirebox-request-id"] = cmdOpts.requestId;
          }

          try {
            const isValid = await verifyWebhook({
              payload,
              headers,
              secret: cmdOpts.secret,
              toleranceMs: (cmdOpts.tolerance ?? 300) * 1000,
            });

            if (isValid) {
              if (opts.json) {
                output({ valid: true }, { json: true });
              } else {
                console.log("✓ Webhook signature is VALID.");
              }
            } else {
              if (opts.json) {
                output({ valid: false, reason: "Signature mismatch" }, { json: true });
              } else {
                console.error("✗ Webhook signature verification FAILED: Signature mismatch.");
              }
              process.exitCode = 1;
            }
          } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            if (opts.json) {
              output({ valid: false, reason: message }, { json: true });
            } else {
              console.error(`✗ Webhook signature verification FAILED: ${message}`);
            }
            process.exitCode = 1;
          }
        })
      );
  }

  const webhookCmd = program
    .command("webhook")
    .description("Manage real-time webhook subscriptions and signature verification");
  attachWebhookSubcommands(webhookCmd);
}
