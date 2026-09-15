/**
 * Wirebox CLI - Self-Signup & Verification Commands
 */

import { Wirebox } from "@wirebox-sh/sdk";
import type { Command } from "commander";
import { getGlobalOpts } from "../client.js";
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
        const apiKey =
          cmdOpts.apiKey ||
          globalOpts.apiKey ||
          (typeof process !== "undefined" && process?.env?.WIREBOX_API_KEY);

        if (!apiKey) {
          console.error("Error: API key is required. Pass --api-key or set WIREBOX_API_KEY.");
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
      })
    );
}
