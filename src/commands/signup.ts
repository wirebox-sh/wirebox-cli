/**
 * Wirebox CLI - Self-Signup & Verification Commands
 */

import { Wirebox } from "@wirebox-sh/sdk";
import type { Command } from "commander";
import { getGlobalOpts, readConfigFile } from "../client.js";
import { withErrorHandler } from "../errors.js";
import { output } from "../output.js";

export function registerSignupCommands(program: Command): void {
  program
    .command("signup")
    .description("Autonomous agent self-registration (no pre-existing API key required)")
    .requiredOption("--human-email <email>", "Email of supervising human operator")
    .option("--display-name <name>", "Human-friendly display name for the agent")
    .option("--note <note>", "Message from the agent to the human operator")
    .option("--harness <harness>", "Agent framework or runtime environment (e.g. claude-code)")
    .action(
      withErrorHandler(async function (
        this: Command,
        cmdOpts: {
          humanEmail: string;
          displayName?: string;
          note?: string;
          harness?: string;
        }
      ) {
        const globalOpts = getGlobalOpts(this);
        const res = await Wirebox.signup(
          {
            human_email: cmdOpts.humanEmail,
            display_name: cmdOpts.displayName,
            note_to_human: cmdOpts.note,
            harness: cmdOpts.harness,
          },
          { baseUrl: globalOpts.baseUrl }
        );

        if (globalOpts.json) {
          output(res, { json: true });
          return;
        }

        console.log();
        console.log("🎉 Agent registered successfully!");
        console.log();
        output({
          "Email Address": res.email_address,
          "Secret API Key": res.api_key,
          "Supervisor": cmdOpts.humanEmail,
          "Status": "Unclaimed (6-digit OTP code sent to supervisor)",
        });
        console.log();
        console.log("👉 Save this API key securely. It is shown only once.");
        console.log(`👉 Run 'wirebox verify --code <code> --api-key ${res.api_key}' to unlock full sending limits.`);
        console.log();
      })
    );

  program
    .command("verify")
    .description("Verify an agent identity using the 6-digit OTP code sent to the supervisor")
    .requiredOption("--code <code>", "The 6-digit verification code from email")
    .option("--api-key <key>", "API key of the unclaimed agent (or set WIREBOX_API_KEY)")
    .action(
      withErrorHandler(async function (
        this: Command,
        cmdOpts: { code: string; apiKey?: string }
      ) {
        const globalOpts = getGlobalOpts(this);
        const fileCfg = readConfigFile();
        const apiKey =
          cmdOpts.apiKey ||
          globalOpts.apiKey ||
          (typeof process !== "undefined" && process?.env?.WIREBOX_API_KEY) ||
          fileCfg.apiKey;

        if (!apiKey) {
          console.error("Error: API key is required. Pass --api-key, set WIREBOX_API_KEY, or configure ~/.wirebox/config.");
          process.exit(1);
        }

        const res = await Wirebox.verifySignup(
          apiKey,
          { verification_code: cmdOpts.code },
          { baseUrl: globalOpts.baseUrl }
        );

        if (globalOpts.json) {
          output(res, { json: true });
          return;
        }

        console.log();
        console.log("✅ Verification successful!");
        console.log("Your agent identity is now claimed and full outbound sending limits are unlocked.");
        console.log();
        console.log("💡 Next steps to authenticate your environment:");
        console.log();
        console.log("  1. Save your API key to local configuration (recommended):");
        console.log(`     mkdir -p ~/.wirebox && echo "api_key=${apiKey}" > ~/.wirebox/config`);
        console.log("     chmod 600 ~/.wirebox/config");
        console.log();
        console.log("  2. Or export it in your current terminal session:");
        console.log(`     export WIREBOX_API_KEY="${apiKey}"`);
        console.log();
        console.log("Then verify your setup anytime with:");
        console.log("  wirebox whoami");
        console.log();
      })
    );
}
