import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import * as readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { Wirebox, resolveApiKey } from "@wirebox-sh/sdk";
import type { ConnectConfig } from "../types.js";
import { globalDriverRegistry } from "../drivers/base.js";
import { ClaudeCodeDriver } from "../drivers/claude-code.js";
import { CodexDriver } from "../drivers/codex.js";
import { HermesDriver } from "../drivers/hermes.js";
import { OpenCodeDriver } from "../drivers/opencode.js";
import { installLaunchd } from "../daemon/launchd.js";

// Ensure drivers are registered
globalDriverRegistry.register(new ClaudeCodeDriver());
globalDriverRegistry.register(new CodexDriver());
globalDriverRegistry.register(new HermesDriver());
globalDriverRegistry.register(new OpenCodeDriver());

export const CONFIG_FILENAME = "connect.json";
export const LEGACY_CONFIG_FILENAME = "bridge.json";

export function getGlobalConfigDir(): string {
  const dir = join(homedir(), ".wirebox");
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  return dir;
}

export function getGlobalConfigPath(filename = CONFIG_FILENAME): string {
  return join(getGlobalConfigDir(), filename);
}

export function loadConnectConfig(projectDir = process.cwd()): Partial<ConnectConfig> {
  let config: Partial<ConnectConfig> = {};

  // 1. Try global ~/.wirebox/connect.json, then fallback to ~/.wirebox/bridge.json
  const globalPath = getGlobalConfigPath(CONFIG_FILENAME);
  const legacyGlobalPath = getGlobalConfigPath(LEGACY_CONFIG_FILENAME);

  if (existsSync(globalPath)) {
    try {
      config = JSON.parse(readFileSync(globalPath, "utf-8"));
    } catch {}
  } else if (existsSync(legacyGlobalPath)) {
    try {
      config = JSON.parse(readFileSync(legacyGlobalPath, "utf-8"));
    } catch {}
  }

  // Fallback API key from ~/.wirebox/config (shared with SDK/CLI)
  if (!config.apiKey) {
    const sdkKey = resolveApiKey();
    if (sdkKey) {
      config.apiKey = sdkKey;
    }
  }

  // 2. Try local project .wirebox/connect.json, then .wirebox/bridge.json
  const localPath = join(projectDir, ".wirebox", CONFIG_FILENAME);
  const legacyLocalPath = join(projectDir, ".wirebox", LEGACY_CONFIG_FILENAME);

  if (existsSync(localPath)) {
    try {
      config = { ...config, ...JSON.parse(readFileSync(localPath, "utf-8")) };
    } catch {}
  } else if (existsSync(legacyLocalPath)) {
    try {
      config = { ...config, ...JSON.parse(readFileSync(legacyLocalPath, "utf-8")) };
    } catch {}
  }

  // 3. Env overrides
  if (process.env.WIREBOX_API_KEY) {
    config.apiKey = process.env.WIREBOX_API_KEY;
  }
  if (process.env.WIREBOX_IDENTITY) {
    config.identityHandle = process.env.WIREBOX_IDENTITY;
  }
  if (process.env.WIREBOX_DRIVER) {
    config.defaultDriver = process.env.WIREBOX_DRIVER;
  }
  if (process.env.WIREBOX_BASE_URL) {
    config.baseUrl = process.env.WIREBOX_BASE_URL;
  }
  if (process.env.WIREBOX_PROJECT_DIR) {
    config.projectDir = process.env.WIREBOX_PROJECT_DIR;
  }

  return config;
}

// Backward compatibility alias
export const loadBridgeConfig = loadConnectConfig;

export function saveConnectConfig(
  config: Partial<ConnectConfig>,
  scope: "global" | "local" = "global",
  projectDir = process.cwd()
): string {
  const targetPath =
    scope === "global"
      ? getGlobalConfigPath(CONFIG_FILENAME)
      : join(projectDir, ".wirebox", CONFIG_FILENAME);

  const dir = scope === "global" ? getGlobalConfigDir() : join(projectDir, ".wirebox");
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  writeFileSync(targetPath, JSON.stringify(config, null, 2), "utf-8");
  return targetPath;
}

// Backward compatibility alias
export const saveBridgeConfig = saveConnectConfig;

export async function runSetupWizard(): Promise<ConnectConfig> {
  const rl = readline.createInterface({ input, output });

  console.log("\n=======================================================");
  console.log("       ⚡ Wirebox Agent Connect Setup Wizard ⚡        ");
  console.log("=======================================================\n");

  try {
    const existing = loadConnectConfig();

    // 1. Wirebox API Key
    let apiKey = existing.apiKey || "";
    if (apiKey) {
      const keepKey = await rl.question(
        `Found existing API key (...${apiKey.slice(-4)}). Keep this key? [Y/n]: `
      );
      if (keepKey.trim().toLowerCase() === "n") {
        apiKey = "";
      }
    }

    while (!apiKey) {
      const inputKey = await rl.question("Enter your Wirebox API Key (wbx_...): ");
      apiKey = inputKey.trim();
      if (!apiKey) {
        console.log("API Key cannot be empty. Visit https://wirebox.sh/console to copy your key.");
      }
    }

    // 2. Validate API Key & Query Identities
    console.log("\nValidating Wirebox API key...");
    const client = new Wirebox({ apiKey, baseUrl: existing.baseUrl });
    let identities: string[] = [];
    try {
      const res = await client.listIdentities({ limit: 10 });
      identities = (res.identities || []).map((i: any) => i.agent_handle);
      console.log(`✓ API key verified! Found ${identities.length} agent identities.`);
    } catch (err: any) {
      console.log(`⚠️ Warning: Could not verify API key (${err.message}). Continuing...`);
    }

    // 3. Choose Identity Handle
    let chosenHandle = existing.identityHandle || identities[0] || "";
    if (identities.length > 0) {
      console.log("\nAvailable agent handles:");
      identities.forEach((h, idx) => console.log(`  [${idx + 1}] ${h}`));
      const sel = await rl.question(
        `Select agent handle [1-${identities.length}] (default: 1): `
      );
      const selIndex = parseInt(sel.trim(), 10) - 1;
      if (!isNaN(selIndex) && identities[selIndex]) {
        chosenHandle = identities[selIndex]!;
      } else if (!chosenHandle) {
        chosenHandle = identities[0] || "";
      }
    } else {
      const manualHandle = await rl.question(
        `Enter agent handle (e.g. dev-agent) [${chosenHandle || "my-agent"}]: `
      );
      chosenHandle = manualHandle.trim() || chosenHandle || "my-agent";
    }

    // 4. Detect and Select Driver
    console.log("\nDetecting installed agent harnesses...");
    const detected = await globalDriverRegistry.detectAvailable();
    const available = detected.filter((d) => d.status.available);

    console.log("Detected drivers:");
    detected.forEach((d) => {
      const statusIcon = d.status.available ? "✓ (Installed)" : "- (Not found)";
      console.log(`  • ${d.driver.displayName} [${d.driver.name}]: ${statusIcon}`);
    });

    let selectedDriver = existing.defaultDriver || (available[0] ? available[0].driver.name : "claude-code");
    const driverInput = await rl.question(
      `\nSelect default agent driver (claude-code / hermes / codex / opencode) [${selectedDriver}]: `
    );
    if (driverInput.trim()) {
      selectedDriver = driverInput.trim().toLowerCase();
    }

    // 5. Select Workspace Directory
    const defaultDir = existing.projectDir || process.cwd();
    const dirInput = await rl.question(
      `\nEnter agent project workspace path [${defaultDir}]: `
    );
    const chosenDir = dirInput.trim() || defaultDir;

    // 6. Save Configuration
    const finalConfig: ConnectConfig = {
      apiKey,
      baseUrl: existing.baseUrl,
      identityHandle: chosenHandle,
      defaultDriver: selectedDriver,
      projectDir: chosenDir,
    };

    const savedPath = saveConnectConfig(finalConfig, "global");
    console.log(`\n✓ Configuration saved to ${savedPath}`);

    // 7. Prompt for Background Daemon (macOS launchd)
    if (process.platform === "darwin") {
      const launchdPrompt = await rl.question(
        "\nWould you like to install Wirebox Connect as a background macOS service (auto-starts on boot)? [y/N]: "
      );
      if (launchdPrompt.trim().toLowerCase() === "y") {
        installLaunchd({
          apiKey,
          identity: chosenHandle,
          driver: selectedDriver,
          projectDir: chosenDir,
        });
        console.log("✓ macOS launchd agent installed and started!");
        console.log("  View logs at: ~/.wirebox/connect.log");
      }
    }

    console.log("\n🎉 Wirebox Connect setup complete!");
    console.log(`Run 'wirebox connect' to launch remote connections anytime.\n`);

    return finalConfig;
  } finally {
    rl.close();
  }
}
