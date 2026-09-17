import { spawn } from "node:child_process";
import type { AgentDriver, ContactSession, TurnOptions, TurnResult } from "../types.js";
import { stripMarkdown } from "../core/prompts.js";

export class OpenCodeDriver implements AgentDriver {
  public readonly name = "opencode";
  public readonly displayName = "OpenCode";
  public readonly description = "OpenCode autonomous coding agent runner with multi-provider model support.";

  private activeProcesses = new Map<string, any>();

  public async isAvailable(): Promise<{ available: boolean; reason?: string; version?: string }> {
    return new Promise((resolve) => {
      try {
        const proc = spawn("opencode", ["--version"]);
        let output = "";

        proc.stdout.on("data", (d) => {
          output += d.toString();
        });

        proc.on("error", () => {
          resolve({
            available: false,
            reason: "'opencode' CLI binary was not found in PATH. Install via: curl -fsSL https://opencode.ai/install | bash",
          });
        });

        proc.on("close", (code) => {
          if (code === 0) {
            const version = output.trim().split("\n")[0] || output.trim();
            resolve({ available: true, version });
          } else {
            resolve({ available: false, reason: `opencode --version exited with code ${code}` });
          }
        });
      } catch (err: any) {
        resolve({ available: false, reason: err.message });
      }
    });
  }

  public async initSession(_session: ContactSession): Promise<void> {
    // OpenCode session initialization
  }

  public async executeTurn(
    session: ContactSession,
    prompt: string,
    options?: TurnOptions
  ): Promise<TurnResult> {
    const isMobile = session.lastChannel === "imessage" || session.lastChannel === "sms";

    return new Promise((resolve, reject) => {
      const args = ["run"];
      if (session.sessionId && session.sessionId.startsWith("ses_")) {
        args.push("--session", session.sessionId);
      }
      args.push(prompt);

      const proc = spawn("opencode", args, {
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

        // Detect interactive confirmation / permission prompts
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
                id: `appr_opencode_${Date.now()}`,
                sessionId: session.sessionId,
                channel: session.lastChannel,
                targetUser: session.contactKey,
                toolName: "OpenCode Tool Execution",
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

        // Clean up OpenCode header banner (e.g. "> build · deepseek-v4-pro\n\n...")
        let replyText = stdout.trim();
        const headerMatch = replyText.match(/^> [^\n]+\n\n([\s\S]*)$/);
        if (headerMatch && headerMatch[1]) {
          replyText = headerMatch[1].trim();
        }

        if (!replyText && stderr.trim()) {
          replyText = `Error from OpenCode: ${stderr.trim()}`;
        }

        if (isMobile) {
          replyText = stripMarkdown(replyText);
        }

        resolve({
          text: replyText,
          toolsUsed: ["opencode-agent"],
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
