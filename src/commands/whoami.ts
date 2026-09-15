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

    if (opts.json) {
      output(info, { json: true });
      return;
    }

    output({
      "Organization ID": info.organization.id,
      "Organization Name": info.organization.name,
      "Slug": info.organization.slug,
      "Billing Plan": info.organization.billing_plan,
      "Claim Status": info.organization.is_claimed ? "Verified (Claimed)" : "Unclaimed (Sandbox)",
      "Supervisor Email": info.organization.claimed_by_email || "-",
      "Auth Type": info.auth.type,
      "Actor ID": info.auth.actor_id,
      "Scoped Identity": info.auth.scoped_identity_id || "(Admin / All Identities)",
      "Active Agents": `${info.usage.agents_count} / ${info.usage.agents_limit}`,
      "Active Webhooks": `${info.usage.webhooks_count} / ${info.usage.webhooks_limit}`,
    });
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
