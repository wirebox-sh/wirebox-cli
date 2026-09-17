import { spawn } from "node:child_process";
import type { AgentDriver, ContactSession, TurnOptions, TurnResult } from "../types.js";
import { stripMarkdown } from "../core/prompts.js";

export class ClaudeCodeDriver implements AgentDriver {
  public readonly name = "claude-code";
  public readonly displayName = "Claude Code";
  public readonly description = "Anthropic's official CLI agent harness with full tool & project workspace access.";

  private activeProcesses = new Map<string, any>();

  public async isAvailable(): Promise<{ available: boolean; reason?: string; version?: string }> {
    return new Promise((resolve) => {
      try {
        const proc = spawn("claude", ["--version"]);
        let output = "";

        proc.stdout.on("data", (d) => {
          output += d.toString();
        });

        proc.on("error", () => {
          resolve({
            available: false,
            reason: "'claude' CLI binary was not found in PATH. Install via: npm install -g @anthropic-ai/claude-code",
          });
        });

        proc.on("close", (code) => {
          if (code === 0) {
            resolve({ available: true, version: output.trim() });
          } else {
            resolve({ available: false, reason: `claude --version exited with code ${code}` });
          }
        });
      } catch (err: any) {
        resolve({ available: false, reason: err.message });
      }
    });
  }

  public async initSession(_session: ContactSession): Promise<void> {
    // Session state initialization in project directory
  }

  public async executeTurn(
    session: ContactSession,
    prompt: string,
    options?: TurnOptions
  ): Promise<TurnResult> {
    const isMobile = session.lastChannel === "imessage" || session.lastChannel === "sms";

    return new Promise((resolve, reject) => {
      // Run Claude Code CLI in non-interactive / print mode for headless driving
      const proc = spawn("claude", ["-p", prompt], {
        cwd: session.projectDir || process.cwd(),
        env: {
          ...process.env,
          CI: "true", // Non-interactive mode for child process
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

        // Detect if Claude requests interactive approval
        // e.g. "Do you want to run: npm test [y/N]?" or "Permission required"
        if (str.includes("[y/N]") || str.includes("Allow this action?")) {
          approvalsCount++;
          if (options?.onApprovalRequired) {
            options
              .onApprovalRequired({
                id: `appr_${Date.now()}`,
                sessionId: session.sessionId,
                channel: session.lastChannel,
                targetUser: session.contactKey,
                toolName: "Bash Command",
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
          replyText = `Error from Claude Code: ${stderr.trim()}`;
        }

        // Strip markdown if user is on mobile
        if (isMobile) {
          replyText = stripMarkdown(replyText);
        }

        resolve({
          text: replyText,
          toolsUsed: ["claude-cli"],
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
