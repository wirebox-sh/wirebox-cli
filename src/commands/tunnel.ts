/**
 * Wirebox CLI - Tunnel Management Commands
 *
 * Provides commands to list, inspect, configure, and connect agent network tunnels.
 */

import { Command } from "commander";
import { createClient, getGlobalOpts } from "../client.js";
import { withErrorHandler } from "../errors.js";
import { output } from "../output.js";

const TUNNEL_COLUMNS = [
  "agent_handle",
  "public_url",
  "status",
  "is_connected",
  "connected_clients",
  "last_request_at",
];

export function registerTunnelCommands(program: Command): void {
  function attachTunnelSubcommands(parent: Command) {
    parent
      .command("list")
      .description("List all agent network tunnels in your organization")
      .option("--status <status>", "Filter by administrative status: active or disabled")
      .option("--connected <bool>", "Filter by live connection state: true or false")
      .option("--limit <n>", "Maximum records to return", (v) => parseInt(v, 10))
      .action(
        withErrorHandler(async function (
          this: Command,
          cmdOpts: { status?: "active" | "disabled"; connected?: string; limit?: number }
        ) {
          const opts = getGlobalOpts(this);
          const client = createClient(opts);
          const isConnected =
            cmdOpts.connected === "true" ? true : cmdOpts.connected === "false" ? false : undefined;

          const tunnels = await client.tunnels.list({
            status: cmdOpts.status,
            is_connected: isConnected,
            limit: cmdOpts.limit,
          });

          if (opts.json) {
            output({ tunnels }, { json: true });
            return;
          }

          const rows = tunnels.map((t) => ({
            agent_handle: t.agent_handle,
            public_url: t.public_url,
            status: t.status,
            is_connected: t.is_connected ? "yes" : "no",
            connected_clients: t.connected_clients,
            last_request_at: t.last_request_at ? t.last_request_at.slice(0, 19).replace("T", " ") : "-",
          }));

          output(rows, { columns: TUNNEL_COLUMNS });
        })
      );

    parent
      .command("get <handle-or-id>")
      .description("Get profile details and live telemetry for an agent's network tunnel")
      .action(
        withErrorHandler(async function (this: Command, handleOrId: string) {
          const opts = getGlobalOpts(this);
          const client = createClient(opts);
          const tunnel = await client.tunnels.get(handleOrId);

          output(
            {
              id: tunnel.id,
              agent_handle: tunnel.agent_handle,
              public_url: tunnel.public_url,
              public_host: tunnel.public_host,
              status: tunnel.status,
              is_connected: tunnel.is_connected ? "yes" : "no",
              connected_clients: tunnel.connected_clients,
              connected_at: tunnel.connected_at || "-",
              disconnected_at: tunnel.disconnected_at || "-",
              client_ip: tunnel.client?.ip || "-",
              client_version: tunnel.client?.version || "-",
              client_forward_to: tunnel.client?.forward_to || "-",
              last_request_at: tunnel.last_request_at || "-",
              created_at: tunnel.created_at,
              updated_at: tunnel.updated_at,
            },
            { json: !!opts.json }
          );
        })
      );

    parent
      .command("update <handle-or-id>")
      .description("Update administrative status for a tunnel ('active' or 'disabled')")
      .requiredOption("--status <status>", "New status: active or disabled")
      .action(
        withErrorHandler(async function (
          this: Command,
          handleOrId: string,
          cmdOpts: { status: "active" | "disabled" }
        ) {
          const opts = getGlobalOpts(this);
          const client = createClient(opts);
          const updated = await client.tunnels.update(handleOrId, { status: cmdOpts.status });

          if (opts.json) {
            output(updated, { json: true });
          } else {
            console.log(`Tunnel '@${updated.agent_handle}' status updated to '${updated.status}'.`);
          }
        })
      );

    parent
      .command("connect <handle-or-id>")
      .description("Connect a local port or URL to the agent's public URL")
      .option("-p, --port <port>", "Local port number (e.g. 3000, 8000)")
      .option("-f, --forward-to <url>", "Local destination URL (e.g. http://localhost:8000)")
      .action(
        withErrorHandler(async function (
          this: Command,
          handleOrId: string,
          cmdOpts: { port?: string; forwardTo?: string }
        ) {
          const opts = getGlobalOpts(this);
          const client = createClient(opts);

          const target = cmdOpts.port ? parseInt(cmdOpts.port, 10) : cmdOpts.forwardTo || "http://localhost:3000";

          console.log(`Connecting tunnel for '${handleOrId}' to ${target}...`);

          const session = await client.tunnels.connect(handleOrId, {
            forwardTo: target,
            clientVersion: "wirebox-cli/0.1.0",
            onStatusChange: (status) => {
              if (status.connected) {
                console.log(`[Status] Connected to Wirebox Edge`);
              } else {
                console.log(`[Status] Disconnected: ${status.error || "connection closed"}`);
              }
            },
            onRequest: (event) => {
              const time = new Date().toTimeString().slice(0, 8);
              const statusStr = event.error ? `ERR 502` : `${event.status} OK`;
              console.log(`[${time}] ${event.method.padEnd(6)} ${event.path.padEnd(30)} ${statusStr.padEnd(8)} (${event.durationMs}ms)`);
            },
          });

          console.log(`\n========================================================`);
          console.log(`  Wirebox Tunnel Online`);
          console.log(`  Agent Handle:  @${session.agentHandle}`);
          console.log(`  Public URL:    ${session.publicUrl}`);
          console.log(`  Local Target:  ${target}`);
          console.log(`========================================================\n`);
          console.log(`Press Ctrl+C to disconnect.\n`);

          const cleanup = async () => {
            console.log("\nDisconnecting tunnel...");
            await session.close();
            process.exit(0);
          };

          process.on("SIGINT", cleanup);
          process.on("SIGTERM", cleanup);

          await session.waitClosed();
        })
      );

    parent
      .command("forward <handle-or-id> [target]")
      .description("Convenience alias for 'connect' (e.g. wirebox tunnel forward @sales-bot 8000)")
      .action(
        withErrorHandler(async function (this: Command, handleOrId: string, target?: string) {
          const opts = getGlobalOpts(this);
          const client = createClient(opts);
          const dest = target || "http://localhost:3000";

          console.log(`Connecting tunnel for '${handleOrId}' to ${dest}...`);

          const session = await client.tunnels.connect(handleOrId, {
            forwardTo: dest,
            clientVersion: "wirebox-cli/0.1.0",
            onStatusChange: (status) => {
              if (status.connected) {
                console.log(`[Status] Connected to Wirebox Edge`);
              } else {
                console.log(`[Status] Disconnected: ${status.error || "connection closed"}`);
              }
            },
            onRequest: (event) => {
              const time = new Date().toTimeString().slice(0, 8);
              const statusStr = event.error ? `ERR 502` : `${event.status} OK`;
              console.log(`[${time}] ${event.method.padEnd(6)} ${event.path.padEnd(30)} ${statusStr.padEnd(8)} (${event.durationMs}ms)`);
            },
          });

          console.log(`\n========================================================`);
          console.log(`  Wirebox Tunnel Online`);
          console.log(`  Agent Handle:  @${session.agentHandle}`);
          console.log(`  Public URL:    ${session.publicUrl}`);
          console.log(`  Local Target:  ${dest}`);
          console.log(`========================================================\n`);
          console.log(`Press Ctrl+C to disconnect.\n`);

          const cleanup = async () => {
            console.log("\nDisconnecting tunnel...");
            await session.close();
            process.exit(0);
          };

          process.on("SIGINT", cleanup);
          process.on("SIGTERM", cleanup);

          await session.waitClosed();
        })
      );
  }

  const tunnelCmd = program
    .command("tunnel")
    .description("Manage agent network tunnels and expose local services to the public internet");
  attachTunnelSubcommands(tunnelCmd);

  const tunCmd = program
    .command("tun")
    .description("Alias for 'tunnel'");
  attachTunnelSubcommands(tunCmd);
}
