/**
 * Wirebox CLI - Agent Connect Commands
 *
 * Connects phone iMessage, SMS, and email directly to local AI agents
 * (Claude Code, Hermes, OpenAI Codex, OpenCode).
 */

import { Command } from "commander";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { execSync } from "node:child_process";
import { getGlobalOpts } from "../client.js";
import { withErrorHandler } from "../errors.js";
import {
  WireboxConnect,
  globalDriverRegistry,
  loadConnectConfig,
  runSetupWizard,
  runDoctor,
  getPlistPath,
  installLaunchd,
  uninstallLaunchd,
  LAUNCHD_LABEL,
  LEGACY_LAUNCHD_LABEL,
} from "../connect/index.js";

interface ConnectOptions {
  apiKey?: string;
  identity?: string;
  driver?: string;
  harness?: string;
  agent?: string;
  dir?: string;
  projectDir?: string;
  domain?: string;
}

export function registerConnectCommands(program: Command): void {
  async function startConnectHandler(
    this: Command,
    handleArg?: string,
    options: ConnectOptions = {}
  ) {
    const globalOpts = getGlobalOpts(this);
    const rawDir = options.dir || options.projectDir;
    const loaded = loadConnectConfig(rawDir);

    const apiKey = options.apiKey || globalOpts.apiKey || loaded.apiKey;
    if (!apiKey) {
      console.error(
        "❌ Error: No API key found. Run 'wirebox connect init' or specify --api-key (or set WIREBOX_API_KEY)."
      );
      process.exit(1);
    }

    const defaultDriver = (
      options.driver ||
      options.harness ||
      options.agent ||
      loaded.defaultDriver ||
      "claude-code"
    ).toLowerCase();
    const projectDir = rawDir || loaded.projectDir || process.cwd();
    const rawHandle = handleArg || options.identity || loaded.identityHandle;
    const identityHandle = rawHandle ? rawHandle.replace(/^@/, "") : undefined;
    const baseUrl = globalOpts.baseUrl || loaded.baseUrl;
    const tunnelDomain = options.domain || loaded.tunnelDomain;

    const connectInstance = new WireboxConnect({
      apiKey,
      baseUrl,
      identityHandle,
      projectDir,
      defaultDriver,
      tunnelDomain,
    });

    console.log("⚡ Starting Wirebox Agent Connect...");
    console.log(`   Driver:    ${defaultDriver}`);
    console.log(`   Workspace: ${projectDir}`);

    const cleanup = async () => {
      console.log("\n🛑 Stopping Wirebox Connect...");
      await connectInstance.stop();
      process.exit(0);
    };

    process.on("SIGINT", cleanup);
    process.on("SIGTERM", cleanup);

    try {
      await connectInstance.start();
    } catch (err: any) {
      console.error(`❌ Failed to start connect: ${err.message}`);
      process.exit(1);
    }
  }

  const connectCmd = program
    .command("connect [handle]")
    .description(
      "Connect phone iMessage, SMS, and email directly to local AI agents (Claude Code, Hermes, Codex, OpenCode)"
    )
    .option("-i, --identity <handle>", "Agent identity handle")
    .option("-d, --driver <driver>", "Agent driver or harness (claude-code, hermes, codex, opencode)")
    .option("--harness <harness>", "Agent harness (alias for --driver)")
    .option("--agent <agent>", "Agent engine (alias for --driver)")
    .option("-p, --dir <path>", "Agent workspace project directory")
    .option("--project-dir <path>", "Agent workspace project directory (alias for --dir)")
    .option("--domain <domain>", "Wirebox tunnel domain (default: wirebox.run)")
    .action(withErrorHandler(startConnectHandler));

  // Subcommand: start
  connectCmd
    .command("start [handle]")
    .description("Start the Wirebox agent connect bridge daemon")
    .option("-i, --identity <handle>", "Agent identity handle")
    .option("-d, --driver <driver>", "Agent driver or harness (claude-code, hermes, codex, opencode)")
    .option("--harness <harness>", "Agent harness (alias for --driver)")
    .option("--agent <agent>", "Agent engine (alias for --driver)")
    .option("-p, --dir <path>", "Agent workspace project directory")
    .option("--project-dir <path>", "Agent workspace project directory (alias for --dir)")
    .option("--domain <domain>", "Wirebox tunnel domain (default: wirebox.run)")
    .action(withErrorHandler(startConnectHandler));

  // Subcommand: init
  connectCmd
    .command("init")
    .alias("setup")
    .description("Run interactive first-time configuration wizard")
    .action(
      withErrorHandler(async () => {
        await runSetupWizard();
      })
    );

  // Subcommand: doctor
  connectCmd
    .command("doctor")
    .description("Run environment and connectivity diagnostics")
    .option("-k, --api-key <key>", "Wirebox API Key")
    .action(
      withErrorHandler(async function (this: Command, opts: { apiKey?: string }) {
        const globalOpts = getGlobalOpts(this);
        const loaded = loadConnectConfig();
        const key = opts.apiKey || globalOpts.apiKey || loaded.apiKey;
        const url = globalOpts.baseUrl || loaded.baseUrl;
        const healthy = await runDoctor(key, url);
        process.exit(healthy ? 0 : 1);
      })
    );

  // Subcommand: drivers
  connectCmd
    .command("drivers")
    .description("List registered agent drivers and check local availability")
    .action(
      withErrorHandler(async () => {
        console.log("\n🤖 Registered Agent Drivers:\n");
        const detected = await globalDriverRegistry.detectAvailable();
        for (const { driver, status } of detected) {
          console.log(`• ${driver.displayName} [${driver.name}]`);
          console.log(`  Description: ${driver.description}`);
          console.log(
            `  Status:      ${
              status.available
                ? `✓ Available ${status.version ? `(${status.version})` : ""}`
                : `✗ Not Available (${status.reason})`
            }\n`
          );
        }
      })
    );

  // Subcommand: demo
  connectCmd
    .command("demo")
    .description("Run live simulation of Jason's remote iMessage & approval escalation use case")
    .action(
      withErrorHandler(async () => {
        const { runJasonDemo } = await import("../connect/ui/demo.js");
        await runJasonDemo();
      })
    );

  // Subcommand group: daemon
  const daemonCmd = connectCmd
    .command("daemon")
    .description("Manage background macOS launchd daemon service");

  daemonCmd
    .command("install")
    .description("Install Wirebox Connect as a background macOS service")
    .option("-d, --driver <driver>", "Agent driver or harness (claude-code, hermes, codex, opencode)")
    .option("--harness <harness>", "Agent harness (alias for --driver)")
    .option("--agent <agent>", "Agent engine (alias for --driver)")
    .option("-p, --dir <path>", "Project directory")
    .option("--project-dir <path>", "Project directory (alias for --dir)")
    .action(
      withErrorHandler(async function (this: Command, options: ConnectOptions) {
        if (process.platform !== "darwin") {
          console.error("Daemon support via launchd is only available on macOS.");
          process.exit(1);
        }

        const globalOpts = getGlobalOpts(this);
        const rawDir = options.dir || options.projectDir;
        const loaded = loadConnectConfig(rawDir);
        const apiKey = globalOpts.apiKey || loaded.apiKey;

        if (!apiKey) {
          console.error("Please run 'wirebox connect init' or configure your API key first.");
          process.exit(1);
        }

        installLaunchd({
          apiKey,
          identity: loaded.identityHandle,
          driver:
            options.driver ||
            options.harness ||
            options.agent ||
            loaded.defaultDriver ||
            "claude-code",
          projectDir: rawDir || loaded.projectDir || process.cwd(),
        });

        console.log("✓ Wirebox Connect background daemon installed and loaded!");
        console.log(`  Plist location: ${getPlistPath()}`);
        console.log(`  Logs:           ~/.wirebox/connect.log`);
      })
    );

  daemonCmd
    .command("uninstall")
    .description("Uninstall background macOS service")
    .action(() => {
      uninstallLaunchd();
      console.log("✓ Wirebox Connect background daemon uninstalled.");
    });

  daemonCmd
    .command("status")
    .description("Check status of the background daemon")
    .action(() => {
      const plistPath = getPlistPath();
      const legacyPlistPath = getPlistPath(LEGACY_LAUNCHD_LABEL);
      const activePlist = existsSync(plistPath)
        ? plistPath
        : existsSync(legacyPlistPath)
        ? legacyPlistPath
        : null;

      if (!activePlist) {
        console.log("Status: Daemon is NOT installed.");
        return;
      }

      console.log(`Daemon plist: ${activePlist} (Installed)`);
      try {
        const out = execSync(
          `launchctl list | grep -E "${LAUNCHD_LABEL}|${LEGACY_LAUNCHD_LABEL}" || true`,
          { encoding: "utf-8" }
        );
        if (out.trim()) {
          console.log(`Status: Running\n  ${out.trim()}`);
        } else {
          console.log("Status: Loaded/Stopped");
        }
      } catch {
        console.log("Status: Unable to query launchctl.");
      }
    });

  daemonCmd
    .command("logs")
    .description("Show recent daemon logs")
    .action(() => {
      const logPath = existsSync(join(homedir(), ".wirebox", "connect.log"))
        ? join(homedir(), ".wirebox", "connect.log")
        : join(homedir(), ".wirebox", "bridge.log");

      const errPath = existsSync(join(homedir(), ".wirebox", "connect.err.log"))
        ? join(homedir(), ".wirebox", "connect.err.log")
        : join(homedir(), ".wirebox", "bridge.err.log");

      console.log(`=== Daemon Logs (${logPath}) ===`);
      if (existsSync(logPath)) {
        const content = readFileSync(logPath, "utf-8");
        console.log(content.slice(-2000) || "(Empty log file)");
      } else {
        console.log("(No log file yet)");
      }

      if (existsSync(errPath)) {
        const errContent = readFileSync(errPath, "utf-8");
        if (errContent.trim()) {
          console.log(`\n=== Error Logs (${errPath}) ===`);
          console.log(errContent.slice(-2000));
        }
      }
    });
}
