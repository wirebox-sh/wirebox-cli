import { existsSync, mkdirSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { execSync } from "node:child_process";

export const LAUNCHD_LABEL = "sh.wirebox.connect";
export const LEGACY_LAUNCHD_LABEL = "sh.wirebox.bridge";

export function getPlistPath(label = LAUNCHD_LABEL): string {
  return join(homedir(), "Library", "LaunchAgents", `${label}.plist`);
}

export function generatePlistContent(params: {
  nodePath: string;
  binPath: string;
  projectDir: string;
  driver: string;
  env: Record<string, string>;
}): string {
  const envEntries = Object.entries(params.env)
    .map(([k, v]) => `      <key>${k}</key>\n      <string>${v}</string>`)
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${LAUNCHD_LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${params.nodePath}</string>
    <string>${params.binPath}</string>
    <string>connect</string>
    <string>--driver</string>
    <string>${params.driver}</string>
    <string>--dir</string>
    <string>${params.projectDir}</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict>
${envEntries}
  </dict>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>${join(homedir(), ".wirebox", "connect.log")}</string>
  <key>StandardErrorPath</key>
  <string>${join(homedir(), ".wirebox", "connect.err.log")}</string>
</dict>
</plist>
`;
}

export function installLaunchd(params: {
  nodePath?: string;
  binPath?: string;
  projectDir?: string;
  driver?: string;
  apiKey: string;
  identity?: string;
}): void {
  const plistPath = getPlistPath();
  const legacyPlistPath = getPlistPath(LEGACY_LAUNCHD_LABEL);
  const dir = join(homedir(), "Library", "LaunchAgents");
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  const wireboxDir = join(homedir(), ".wirebox");
  if (!existsSync(wireboxDir)) {
    mkdirSync(wireboxDir, { recursive: true });
  }

  const nodePath = params.nodePath || process.execPath;
  const binPath = params.binPath || process.argv[1] || "wirebox";
  const projectDir = params.projectDir || process.cwd();
  const driver = params.driver || "claude-code";

  const content = generatePlistContent({
    nodePath,
    binPath,
    projectDir,
    driver,
    env: {
      WIREBOX_API_KEY: params.apiKey,
      ...(params.identity ? { WIREBOX_IDENTITY: params.identity } : {}),
      PATH: process.env.PATH || "/usr/local/bin:/usr/bin:/bin:/opt/homebrew/bin",
    },
  });

  writeFileSync(plistPath, content, "utf-8");

  try {
    if (existsSync(legacyPlistPath)) {
      execSync(`launchctl unload "${legacyPlistPath}" 2>/dev/null || true`);
      unlinkSync(legacyPlistPath);
    }
    execSync(`launchctl unload "${plistPath}" 2>/dev/null || true`);
    execSync(`launchctl load "${plistPath}"`);
  } catch {}
}

export function uninstallLaunchd(): void {
  for (const label of [LAUNCHD_LABEL, LEGACY_LAUNCHD_LABEL]) {
    const plistPath = getPlistPath(label);
    if (existsSync(plistPath)) {
      try {
        execSync(`launchctl unload "${plistPath}" 2>/dev/null || true`);
      } catch {}
      unlinkSync(plistPath);
    }
  }
}
