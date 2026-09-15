/**
 * Wirebox CLI - Identity Management Commands
 */

import type { Command } from "commander";
import { createClient, getGlobalOpts } from "../client.js";
import { withErrorHandler } from "../errors.js";
import { output } from "../output.js";

const IDENTITY_COLUMNS = [
  "agent_handle",
  "display_name",
  "email_address",
  "status",
  "created_at",
];

export function registerIdentityCommands(program: Command): void {
  function attachIdentitySubcommands(parent: Command) {
    parent
      .command("create")
      .description("Create a new agent identity with an atomic dedicated mailbox")
      .requiredOption("--handle <handle>", "Globally unique agent handle (e.g. sales-bot)")
      .option("--display-name <name>", "Human-friendly display name")
      .option("--description <desc>", "Agent role or description")
      .action(
        withErrorHandler(async function (
          this: Command,
          cmdOpts: { handle: string; displayName?: string; description?: string }
        ) {
          const opts = getGlobalOpts(this);
          const client = createClient(opts);
          const agent = await client.createIdentity({
            agent_handle: cmdOpts.handle,
            display_name: cmdOpts.displayName,
            description: cmdOpts.description,
          });

          output(
            {
              id: agent.id,
              agent_handle: agent.agent_handle,
              display_name: agent.display_name,
              email_address: agent.mailbox.email_address,
              status: agent.status,
              created_at: agent.created_at,
            },
            { json: !!opts.json }
          );
        })
      );

    parent
      .command("list")
      .description("List agent identities in this organization")
      .option("--limit <n>", "Maximum records to return", (v) => parseInt(v, 10))
      .option("--offset <n>", "Pagination offset", (v) => parseInt(v, 10))
      .option("--status <status>", "Filter by status: active, archived, or deleted")
      .action(
        withErrorHandler(async function (
          this: Command,
          cmdOpts: { limit?: number; offset?: number; status?: "active" | "archived" | "deleted" }
        ) {
          const opts = getGlobalOpts(this);
          const client = createClient(opts);
          const res = await client.listIdentities({
            limit: cmdOpts.limit,
            offset: cmdOpts.offset,
            status: cmdOpts.status,
          });

          if (opts.json) {
            output(res, { json: true });
            return;
          }

          const rows = res.identities.map((item) => ({
            agent_handle: item.agent_handle,
            display_name: item.display_name,
            email_address: item.mailbox.email_address,
            status: item.status,
            created_at: item.created_at.slice(0, 19).replace("T", " "),
          }));

          output(rows, { columns: IDENTITY_COLUMNS });
        })
      );

    parent
      .command("get [handle]")
      .description("Get profile details and mailbox status for an agent identity")
      .action(
        withErrorHandler(async function (this: Command, handle?: string) {
          const opts = getGlobalOpts(this);
          const client = createClient(opts);
          const agent = await client.getIdentity(handle);

          output(
            {
              id: agent.id,
              agent_handle: agent.agent_handle,
              display_name: agent.display_name,
              description: agent.description || "-",
              email_address: agent.mailbox.email_address,
              mailbox_id: agent.mailbox.id || "-",
              status: agent.status,
              created_at: agent.created_at,
              updated_at: agent.updated_at,
            },
            { json: !!opts.json }
          );
        })
      );

    parent
      .command("update <handle>")
      .description("Update an existing agent identity's profile")
      .option("--display-name <name>", "New display name")
      .option("--description <desc>", "New description")
      .action(
        withErrorHandler(async function (
          this: Command,
          handle: string,
          cmdOpts: { displayName?: string; description?: string }
        ) {
          const opts = getGlobalOpts(this);
          const client = createClient(opts);
          const agent = await client.getIdentity(handle);
          const updated = await agent.update({
            display_name: cmdOpts.displayName,
            description: cmdOpts.description,
          });

          output(
            {
              agent_handle: updated.agent_handle,
              display_name: updated.display_name,
              description: updated.description || "-",
              status: updated.status,
              updated_at: updated.updated_at,
            },
            { json: !!opts.json }
          );
        })
      );

    parent
      .command("delete <handle>")
      .description("Permanently delete an agent identity and its mailbox")
      .action(
        withErrorHandler(async function (this: Command, handle: string) {
          const opts = getGlobalOpts(this);
          const client = createClient(opts);
          const agent = await client.getIdentity(handle);
          await agent.delete();

          if (opts.json) {
            output({ success: true, deleted_handle: handle }, { json: true });
          } else {
            console.log(`Identity '${handle}' deleted successfully.`);
          }
        })
      );
  }

  const identityCmd = program
    .command("identity")
    .description("Manage agent identities and digital personas");
  attachIdentitySubcommands(identityCmd);

  const idCmd = program
    .command("id")
    .description("Alias for 'identity'");
  attachIdentitySubcommands(idCmd);
}
