import { Wirebox } from "@wirebox-sh/sdk";
import { globalDriverRegistry } from "../drivers/base.js";

export async function runDoctor(apiKey?: string, baseUrl?: string): Promise<boolean> {
  console.log("\n🔍 Running Wirebox Agent Connect Doctor...\n");
  let allHealthy = true;

  // 1. Node.js Version
  const nodeVersion = process.versions.node || "18.0.0";
  const major = parseInt(nodeVersion.split(".")[0] || "18", 10);
  if (major >= 18) {
    console.log(`  ✓ Node.js runtime: v${nodeVersion} (Supported)`);
  } else {
    console.log(`  ✗ Node.js runtime: v${nodeVersion} (Node.js 18+ required)`);
    allHealthy = false;
  }

  // 2. Wirebox Credentials
  const resolvedKey = apiKey || process.env.WIREBOX_API_KEY;
  if (!resolvedKey) {
    console.log("  ✗ WIREBOX_API_KEY: Missing (set WIREBOX_API_KEY or run setup wizard)");
    allHealthy = false;
  } else {
    try {
      const client = new Wirebox({ apiKey: resolvedKey, baseUrl });
      const res = await client.listIdentities({ limit: 5 });
      const count = res.identities?.length || 0;
      console.log(`  ✓ Wirebox API: Connected (${count} agent identities found)`);
    } catch (err: any) {
      console.log(`  ✗ Wirebox API: Connection failed (${err.message})`);
      allHealthy = false;
    }
  }

  // 3. Detect Agent Drivers
  console.log("\n🤖 Agent Driver Availability:");
  const drivers = await globalDriverRegistry.detectAvailable();
  let availableDriversCount = 0;

  for (const { driver, status } of drivers) {
    if (status.available) {
      console.log(`  ✓ ${driver.displayName} (${driver.name}): Available ${status.version ? `[${status.version}]` : ""}`);
      availableDriversCount++;
    } else {
      console.log(`  - ${driver.displayName} (${driver.name}): Not detected (${status.reason})`);
    }
  }

  if (availableDriversCount === 0) {
    console.log("  ⚠️ Warning: No supported agent CLI (Claude Code or Codex) was detected on PATH.");
  }

  console.log(
    allHealthy
      ? "\n✨ Doctor check passed! Your environment is ready to connect.\n"
      : "\n⚠️ Some checks failed. Please fix the issues above before running connect.\n"
  );

  return allHealthy;
}
