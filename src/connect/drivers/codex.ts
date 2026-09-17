import { spawn } from "node:child_process";
import type { AgentDriver, ContactSession, TurnOptions, TurnResult } from "../types.js";
import { stripMarkdown } from "../core/prompts.js";

export class CodexDriver implements AgentDriver {
  public readonly name = "codex";
  public readonly displayName = "OpenAI Codex";
  public readonly description = "Drives OpenAI Codex CLI / agent runner with project workspace tool execution.";

  private activeProcesses = new Map<string, any>();

  public async isAvailable(): Promise<{ available: boolean; reason?: string; version?: string }> {
    return new Promise((resolve) => {
      try {
        const proc = spawn("codex", ["--version"]);
        let output = "";

        proc.stdout.on("data", (d) => {
          output += d.toString();
        });

        proc.on("error", () => {
          resolve({
            available: false,
            reason: "'codex' CLI binary was not found in PATH.",
          });
        });

        proc.on("close", (code) => {
          if (code === 0) {
            resolve({ available: true, version: output.trim() });
          } else {
            resolve({ available: false, reason: `codex --version exited with code ${code}` });
          }
        });
      } catch (err: any) {
        resolve({ available: false, reason: err.message });
      }
    });
  }

  public async initSession(_session: ContactSession): Promise<void> {
    // Codex session initialization
  }

  public async executeTurn(
    session: ContactSession,
    prompt: string,
    options?: TurnOptions
  ): Promise<TurnResult> {
    const isMobile = session.lastChannel === "imessage" || session.lastChannel === "sms";

    return new Promise((resolve, reject) => {
      // Spawn codex CLI with non-interactive prompt
      const proc = spawn("codex", ["exec", prompt], {
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

        // Detect approval / permission prompt from Codex runner
        if (str.includes("Confirm action [y/n]") || str.includes("Approve execution?")) {
          approvalsCount++;
          if (options?.onApprovalRequired) {
            options
              .onApprovalRequired({
                id: `appr_codex_${Date.now()}`,
                sessionId: session.sessionId,
                channel: session.lastChannel,
                targetUser: session.contactKey,
                toolName: "Codex Tool Execution",
                command: str.trim(),
                choices: [
                  { key: "1", label: "Approve once", action: "allow_once" },
                  { key: "2", label: "Always approve in this session", action: "allow_always" },
                  { key: "3", label: "Reject", action: "deny" },
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
          replyText = `Codex execution notice: ${stderr.trim()}`;
        }

        if (isMobile) {
          replyText = stripMarkdown(replyText);
        }

        resolve({
          text: replyText,
          toolsUsed: ["codex-cli"],
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
