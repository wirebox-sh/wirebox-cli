/**
 * Wirebox CLI - Tunnel Management Commands
 *
 * Provides commands to list, inspect, configure, and connect agent network tunnels.
 */

import { Command } from "commander";
import { CLI_VERSION, createClient, getGlobalOpts } from "../client.js";
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

function formatClockTime(isoString?: string | null): string {
  if (!isoString) return "-";
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return isoString;
    return d.toTimeString().slice(0, 8);
  } catch {
    return isoString;
  }
}

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
      .command("status [handle-or-id]")
      .aliases(["info", "get", "view"])
      .description("Get live status, public endpoint, and telemetry for an agent's network tunnel")
      .action(
        withErrorHandler(async function (this: Command, handleOrId?: string) {
          const opts = getGlobalOpts(this);
          const client = createClient(opts);

          let target = handleOrId;
          if (!target) {
            const agent = await client.getIdentity();
            target = agent.agent_handle;
          }

          const tunnel = await client.tunnels.get(target);

          if (opts.json) {
            output(tunnel, { json: true });
            return;
          }

          const record: Record<string, string> = {
            "Agent Handle": `@${tunnel.agent_handle}`,
            "Public URL": tunnel.public_url,
          };

          if (tunnel.status === "disabled") {
            record["Tunnel Status"] = "Disabled (Administratively disabled)";
          } else if (tunnel.is_connected) {
            const clientCount = tunnel.connected_clients || 1;
            record["Tunnel Status"] = `Active (Connected · ${clientCount} client${clientCount > 1 ? "s" : ""})`;
            record["Forwarding To"] = tunnel.client?.forward_to || "-";
            if (tunnel.client?.ip) {
              record["Client IP"] = tunnel.client.version
                ? `${tunnel.client.ip} (${tunnel.client.version})`
                : tunnel.client.ip;
            }
            if (tunnel.connected_at) {
              record["Connected Since"] = `${formatRelativeTime(tunnel.connected_at)} (${formatClockTime(tunnel.connected_at)})`;
            }
            if (tunnel.last_request_at) {
              record["Last Request"] = `${formatRelativeTime(tunnel.last_request_at)} (${formatClockTime(tunnel.last_request_at)})`;
            }
          } else {
            record["Tunnel Status"] = "Active (Disconnected)";
            if (tunnel.disconnected_at) {
              record["Disconnected At"] = `${formatRelativeTime(tunnel.disconnected_at)} (${formatClockTime(tunnel.disconnected_at)})`;
            }
          }

          output(record);

          if (!tunnel.is_connected && tunnel.status !== "disabled") {
            console.log(`\nHint: Expose a local service using 'wirebox tunnel connect ${tunnel.agent_handle} --port <port>'.`);
          }
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
      .command("connect [handle-or-id]")
      .description("Connect a local port or URL to the agent's public URL")
      .option("-p, --port <port>", "Local port number (e.g. 3000, 8000)")
      .option("-f, --forward-to <url>", "Local destination URL (e.g. http://localhost:8000)")
      .action(
        withErrorHandler(async function (
          this: Command,
          handleOrId: string | undefined,
          cmdOpts: { port?: string; forwardTo?: string }
        ) {
          const opts = getGlobalOpts(this);
          const client = createClient(opts);

          let targetHandle = handleOrId;
          if (!targetHandle) {
            const agent = await client.getIdentity();
            targetHandle = agent.agent_handle;
          }

          const target = cmdOpts.port ? parseInt(cmdOpts.port, 10) : cmdOpts.forwardTo || "http://localhost:3000";

          console.log(`Connecting tunnel for '${targetHandle}' to ${target}...`);

          const session = await client.tunnels.connect(targetHandle, {
            forwardTo: target,
            clientVersion: `wirebox-cli/${CLI_VERSION}`,
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
      .command("forward [handle-or-id] [target]")
      .description("Convenience alias for 'connect' (e.g. wirebox tunnel forward @sales-bot 8000)")
      .action(
        withErrorHandler(async function (this: Command, handleOrId?: string, target?: string) {
          const opts = getGlobalOpts(this);
          const client = createClient(opts);

          let targetHandle = handleOrId;
          let dest = target;

          // If the first argument is a port number like "3000" or URL like "http://...", treat it as target
          if (handleOrId && (/^\d+$/.test(handleOrId) || handleOrId.startsWith("http"))) {
            dest = handleOrId;
            const agent = await client.getIdentity();
            targetHandle = agent.agent_handle;
          } else if (!targetHandle) {
            const agent = await client.getIdentity();
            targetHandle = agent.agent_handle;
          }

          dest = dest || "http://localhost:3000";

          console.log(`Connecting tunnel for '${targetHandle}' to ${dest}...`);

          const session = await client.tunnels.connect(targetHandle, {
            forwardTo: dest,
            clientVersion: `wirebox-cli/${CLI_VERSION}`,
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
}
