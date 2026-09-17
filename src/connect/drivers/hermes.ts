import { spawn } from "node:child_process";
import type { AgentDriver, ContactSession, TurnOptions, TurnResult } from "../types.js";
import { stripMarkdown } from "../core/prompts.js";

export class HermesDriver implements AgentDriver {
  public readonly name = "hermes";
  public readonly displayName = "Hermes Agent";
  public readonly description = "NousResearch's open-source autonomous agent harness with memory, skills, and tools.";

  private activeProcesses = new Map<string, any>();

  public async isAvailable(): Promise<{ available: boolean; reason?: string; version?: string }> {
    return new Promise((resolve) => {
      try {
        const proc = spawn("hermes", ["--version"]);
        let output = "";

        proc.stdout.on("data", (d) => {
          output += d.toString();
        });

        proc.on("error", () => {
          resolve({
            available: false,
            reason: "'hermes' CLI binary was not found in PATH. Install via: curl -fsSL https://hermes-agent.nousresearch.com/install.sh | bash",
          });
        });

        proc.on("close", (code) => {
          if (code === 0) {
            const firstLine = output.trim().split("\n")[0];
            resolve({ available: true, version: firstLine || output.trim() });
          } else {
            resolve({ available: false, reason: `hermes --version exited with code ${code}` });
          }
        });
      } catch (err: any) {
        resolve({ available: false, reason: err.message });
      }
    });
  }

  public async initSession(_session: ContactSession): Promise<void> {
    // Hermes session initialization
  }

  public async executeTurn(
    session: ContactSession,
    prompt: string,
    options?: TurnOptions
  ): Promise<TurnResult> {
    const isMobile = session.lastChannel === "imessage" || session.lastChannel === "sms";

    return new Promise((resolve, reject) => {
      // Run Hermes Agent in one-shot mode with session continuity if available
      const args = ["-z", prompt];
      if (session.sessionId) {
        args.push("--continue", session.sessionId);
      }

      const proc = spawn("hermes", args, {
        cwd: session.projectDir || process.cwd(),
        env: {
          ...process.env,
          CI: "true",
        },
      });

      this.activeProcesses.set(session.sessionId, proc);

      let stdout = "";
      let stderr = "";
      let approvalsCount = 0;

      proc.stdout.on("data", (chunk) => {
        const str = chunk.toString();
        stdout += str;
        options?.onOutputChunk?.(str);

        // Detect approval / confirmation prompts from Hermes tool execution
        if (
          str.includes("[y/N]") ||
          str.includes("[y/n]") ||
          str.includes("Allow this action?") ||
          str.includes("Confirm action") ||
          str.includes("Permission required")
        ) {
          approvalsCount++;
          if (options?.onApprovalRequired) {
            options
              .onApprovalRequired({
                id: `appr_hermes_${Date.now()}`,
                sessionId: session.sessionId,
                channel: session.lastChannel,
                targetUser: session.contactKey,
                toolName: "Hermes Tool Execution",
                command: str.trim(),
                choices: [
                  { key: "1", label: "Allow once", action: "allow_once" },
                  { key: "2", label: "Always allow in this session", action: "allow_always" },
                  { key: "3", label: "Deny", action: "deny" },
                ],
                status: "pending",
                createdAt: Date.now(),
                expiresAt: Date.now() + 15 * 60 * 1000,
              })
              .then((action) => {
                if (action === "deny") {
                  proc.stdin.write("n\n");
                } else {
                  proc.stdin.write("y\n");
                }
              })
              .catch(() => {
                proc.stdin.write("n\n");
              });
          }
        }
      });

      proc.stderr.on("data", (chunk) => {
        stderr += chunk.toString();
      });

      proc.on("error", (err) => {
        this.activeProcesses.delete(session.sessionId);
        reject(err);
      });

      proc.on("close", (_code) => {
        this.activeProcesses.delete(session.sessionId);

        let replyText = stdout.trim();
        if (!replyText && stderr.trim()) {
          replyText = `Error from Hermes: ${stderr.trim()}`;
        }

        if (isMobile) {
          replyText = stripMarkdown(replyText);
        }

        resolve({
          text: replyText,
          toolsUsed: ["hermes-agent"],
          approvalsRequested: approvalsCount,
          completedAt: new Date().toISOString(),
        });
      });
    });
  }

  public async disposeSession(sessionId: string): Promise<void> {
    const proc = this.activeProcesses.get(sessionId);
    if (proc) {
      proc.kill();
      this.activeProcesses.delete(sessionId);
    }
  }
}
