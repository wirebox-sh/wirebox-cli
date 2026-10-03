/**
 * Wirebox CLI - Whoami / Me Command
 */

import type { Command } from "commander";
import { createClient, getGlobalOpts } from "../client.js";
import { withErrorHandler } from "../errors.js";
import { output } from "../output.js";

export function registerWhoamiCommand(program: Command): void {
  const handler = withErrorHandler(async function (this: Command) {
    const opts = getGlobalOpts(this);
    const client = createClient(opts);
    const info = await client.whoami();

    // If the caller is scoped to a specific agent, resolve its full profile (handle, email, tunnel)
    let scopedAgent: any = null;
    if (info.auth.scoped_identity_id) {
      try {
        scopedAgent = await client.getIdentity();
      } catch {
        // Fallback if identity lookup fails
      }
    }

    if (opts.json) {
      output(
        {
          ...info,
          identity: scopedAgent
            ? {
                id: scopedAgent.id,
                handle: scopedAgent.agent_handle,
                display_name: scopedAgent.display_name,
                email_address: scopedAgent.mailbox?.email_address || null,
                public_url: scopedAgent.tunnel?.public_url || null,
                tunnel_status: scopedAgent.tunnel?.status || null,
                imessage_enabled: scopedAgent.imessage_enabled ?? false,
              }
            : null,
        },
        { json: true }
      );
      return;
    }

    const record: Record<string, string> = {};

    if (scopedAgent) {
      record["Agent Handle"] = `@${scopedAgent.agent_handle}`;
      record["Display Name"] = scopedAgent.display_name;
      record["Email Address"] = scopedAgent.mailbox?.email_address || "-";
      record["Public Tunnel"] = scopedAgent.tunnel?.public_url
        ? `${scopedAgent.tunnel.public_url} (${scopedAgent.tunnel.status})`
        : "-";
      record["iMessage Channel"] = scopedAgent.imessage_enabled ? "Enabled" : "Disabled";
    } else {
      record["Role"] = "Admin (All Identities)";
    }

    record["Organization ID"] = info.organization.id;
    record["Organization Name"] = info.organization.name;
    record["Billing Plan"] = info.organization.billing_plan;
    record["Claim Status"] = info.organization.is_claimed ? "Verified (Claimed)" : "Unclaimed (Sandbox)";
    record["Supervisor Email"] = info.organization.claimed_by_email || "-";
    record["Active Agents"] = `${info.usage.agents_count} / ${info.usage.agents_limit}`;
    record["Active Webhooks"] = `${info.usage.webhooks_count} / ${info.usage.webhooks_limit}`;

    output(record);
  });

  program
    .command("whoami")
    .description("Display the authenticated caller's identity, organization, and telemetry")
    .action(handler);

  program
    .command("me")
    .description("Alias for whoami")
    .action(handler);
}
