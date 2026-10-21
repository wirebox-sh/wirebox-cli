/**
 * Wirebox CLI - Agent-to-Agent (A2A 1.0) Commands
 */

import * as fs from "node:fs";
import * as path from "node:path";
import type {
  A2AReplyIntent,
  A2ASkill,
  A2ATask,
  A2ATaskState,
} from "@wirebox-sh/sdk";
import { Command } from "commander";
import { createClient, getGlobalOpts } from "../client.js";
import { withErrorHandler } from "../errors.js";
import { formatRelativeTime, output, printTable } from "../output.js";

const TASK_COLUMNS = ["taskId", "role", "peer", "state", "updated", "summary"];

async function resolveIdentity(cmd: Command, handle?: string) {
  const client = createClient(getGlobalOpts(cmd));
  const clean = handle ? handle.replace(/^@/, "").trim().toLowerCase() : undefined;
  return client.getIdentity(clean);
}

function formatTaskRows(tasks: A2ATask[], isSent?: boolean) {
  return tasks.map((t) => ({
    taskId: t.taskId,
    role: isSent ? "requester" : "worker",
    peer: isSent
      ? t.requester?.handle || "-"
      : t.requester?.handle || t.requester?.source || "-",
    state: t.status.state,
    updated: formatRelativeTime(t.status.timestamp || t.updatedAt),
    summary:
      t.status.message ||
      t.messages[0]?.parts[0]?.text?.slice(0, 45) ||
      "-",
  }));
}

function renderTaskDetail(task: A2ATask, json?: boolean): void {
  if (json) {
    output(task, { json: true });
    return;
  }

  console.log(`\n============================================================`);
  console.log(`TASK: ${task.taskId}`);
  console.log(`============================================================`);
  console.log(`State        : ${task.status.state.toUpperCase()}`);
  console.log(`Status Msg   : ${task.status.message || "-"}`);
  console.log(`Context ID   : ${task.contextId || "-"}`);
  console.log(`Created At   : ${task.createdAt}`);
  console.log(`Updated At   : ${task.updatedAt}`);
  if (task.completedAt) {
    console.log(`Completed At : ${task.completedAt}`);
  }
  if (task.requester) {
    console.log(`Requester    : ${JSON.stringify(task.requester)}`);
  }

  // Conversation Log
  console.log(`\n--- Conversation Log (${task.messages.length} message${task.messages.length === 1 ? "" : "s"}) ---`);
  for (const msg of task.messages) {
    const roleTag = msg.role === "user" ? "[USER/CALLER]" : "[AGENT/WORKER]";
    const time = msg.timestamp ? formatRelativeTime(msg.timestamp) : "";
    console.log(`\n${roleTag} ${time}`);
    for (const part of msg.parts) {
      if (part.text) {
        console.log(`  ${part.text}`);
      } else if (part.data) {
        console.log(`  ${JSON.stringify(part.data, null, 2)}`);
      }
    }
  }

  // Deliverables
  if (task.artifacts && task.artifacts.length > 0) {
    console.log(`\n--- Deliverables / Artifacts (${task.artifacts.length}) ---`);
    for (const art of task.artifacts) {
      console.log(`• ${art.name} [${art.mimeType}] (ID: ${art.artifactId || "-"})`);
      for (const p of art.parts) {
        if (p.text) console.log(`  ${p.text}`);
      }
    }
  }
  console.log("");
}

export function registerA2ACommands(program: Command): void {
  const a2a = program
    .command("a2a")
    .description("Agent-to-Agent (A2A 1.0) task execution, ledger, and card commands");

  // ==========================================================================
  // 1. Calling & Execution Commands
  // ==========================================================================

  a2a
    .command("run <agent> <prompt>")
    .description("Run a task against a remote agent and stream live progress until completion")
    .option("-i, --identity <handle>", "Local agent identity to execute the call from")
    .option("--context <id>", "Context ID to group multi-turn conversation")
    .option("--credential <token>", "Explicit Bearer token when targeting third-party agent")
    .option("--no-stream", "Disable live streaming progress updates")
    .option("--timeout <seconds>", "Execution timeout in seconds", "120")
    .action(
      withErrorHandler(async function (
        this: Command,
        agent: string,
        prompt: string,
        opts: {
          identity?: string;
          context?: string;
          credential?: string;
          stream?: boolean;
          timeout?: string;
        }
      ) {
        const identity = await resolveIdentity(this, opts.identity);
        const timeoutMs = opts.timeout ? Number(opts.timeout) * 1000 : 120_000;
        const json = !!getGlobalOpts(this).json;

        const taskHandle = await identity.a2a.call(agent, {
          text: prompt,
          contextId: opts.context,
          credential: opts.credential,
          timeoutMs,
        });

        if (json) {
          const finalTask = await taskHandle.wait({ timeoutMs });
          output(finalTask, { json: true });
          if (finalTask.status.state === "failed" || finalTask.status.state === "canceled") {
            process.exitCode = 1;
          }
          return;
        }

        console.log(`\n🚀 [A2A] Task submitted: ${taskHandle.id} -> @${agent}`);
        if (opts.context) {
          console.log(`   Context: ${opts.context}`);
        }

        if (opts.stream === false) {
          const finalTask = await taskHandle.wait({ timeoutMs });
          renderTaskDetail(finalTask, false);
          return;
        }

        // Streaming progress loop
        for await (const event of taskHandle.watch({ timeoutMs })) {
          if (event.isProgress) {
            console.log(`⏳ [progress] ${event.message || event.state}`);
          } else if (event.isInputRequired) {
            console.log(`⚠️  [input-required] ${event.message || "Agent is waiting for caller input."}`);
          } else if (event.isFailed) {
            console.log(`❌ [failed] ${event.message || "Task failed."}`);
            process.exitCode = 1;
          } else if (event.isCompleted) {
            console.log(`✅ [completed] ${event.message || "Task completed successfully."}`);
            if (event.task.artifacts && event.task.artifacts.length > 0) {
              console.log(`\n📦 Artifacts (${event.task.artifacts.length}):`);
              for (const a of event.task.artifacts) {
                console.log(`   - ${a.name} [${a.mimeType}]`);
              }
            }
          }
        }
      })
    );

  a2a
    .command("call <agent> <prompt>")
    .description("Submit an asynchronous A2A task and return the task ID immediately")
    .option("-i, --identity <handle>", "Local agent identity to execute the call from")
    .option("--context <id>", "Context ID to group multi-turn conversation")
    .option("--credential <token>", "Explicit Bearer token when targeting third-party agent")
    .action(
      withErrorHandler(async function (
        this: Command,
        agent: string,
        prompt: string,
        opts: { identity?: string; context?: string; credential?: string }
      ) {
        const identity = await resolveIdentity(this, opts.identity);
        const taskHandle = await identity.a2a.call(agent, {
          text: prompt,
          contextId: opts.context,
          credential: opts.credential,
        });

        output(
          {
            taskId: taskHandle.id,
            state: taskHandle.initialTask.status.state,
            contextId: taskHandle.contextId || null,
            message: taskHandle.initialTask.status.message || null,
          },
          { json: !!getGlobalOpts(this).json }
        );
      })
    );

  a2a
    .command("watch <task-id>")
    .description("Stream live progress updates for an in-flight A2A task")
    .option("-i, --identity <handle>", "Local agent identity")
    .option("--target <url>", "Remote agent card URL if tracking external agent")
    .option("--timeout <seconds>", "Observation timeout in seconds", "120")
    .action(
      withErrorHandler(async function (
        this: Command,
        taskId: string,
        opts: { identity?: string; target?: string; timeout?: string }
      ) {
        const identity = await resolveIdentity(this, opts.identity);
        const timeoutMs = opts.timeout ? Number(opts.timeout) * 1000 : 120_000;

        const cardUrl = opts.target || `${identity.a2a.client["platformOrigin"]}/a2a/${identity.agent_handle}/card`;
        const target = await identity.a2a.client.fetchCard(cardUrl);

        for await (const event of identity.a2a.client.watch(target, taskId, { timeoutMs })) {
          if (getGlobalOpts(this).json) {
            console.log(JSON.stringify(event));
          } else {
            console.log(`[${event.state.toUpperCase()}] ${event.message || "-"}`);
          }
        }
      })
    );

  a2a
    .command("cancel <task-id>")
    .description("Cancel an active A2A task")
    .option("-i, --identity <handle>", "Agent identity handle")
    .option("--reason <reason>", "Cancellation reason")
    .action(
      withErrorHandler(async function (
        this: Command,
        taskId: string,
        opts: { identity?: string; reason?: string }
      ) {
        const identity = await resolveIdentity(this, opts.identity);
        const task = await identity.a2a.tasks.cancel(taskId, opts.reason);
        output(task, { json: !!getGlobalOpts(this).json });
      })
    );

  // ==========================================================================
  // 2. Task Ledger Queries
  // ==========================================================================

  a2a
    .command("tasks")
    .description("List tasks assigned to this agent (or tasks sent with --sent)")
    .option("-i, --identity <handle>", "Agent identity handle")
    .option("--sent", "List tasks delegated to other agents (requester view)", false)
    .option("--state <state>", "Filter by state (submitted, working, input-required, completed, failed, canceled)")
    .option("--context <id>", "Filter by context ID")
    .option("--limit <n>", "Maximum number of tasks to return", "25")
    .action(
      withErrorHandler(async function (
        this: Command,
        opts: {
          identity?: string;
          sent?: boolean;
          state?: string;
          context?: string;
          limit: string;
        }
      ) {
        const identity = await resolveIdentity(this, opts.identity);
        const tasks = await identity.a2a.tasks.list({
          role: opts.sent ? "requester" : "worker",
          state: opts.state as A2ATaskState | undefined,
          contextId: opts.context,
          limit: Number(opts.limit) || 25,
        });

        if (getGlobalOpts(this).json) {
          output(tasks, { json: true });
          return;
        }

        const rows = formatTaskRows(tasks, opts.sent);
        printTable(rows, TASK_COLUMNS);
      })
    );

  a2a
    .command("task <task-id>")
    .description("Show task details, full conversation log, and deliverables")
    .option("-i, --identity <handle>", "Agent identity handle")
    .action(
      withErrorHandler(async function (this: Command, taskId: string, opts: { identity?: string }) {
        const identity = await resolveIdentity(this, opts.identity);
        const task = await identity.a2a.tasks.get(taskId);
        renderTaskDetail(task, !!getGlobalOpts(this).json);
      })
    );

  // ==========================================================================
  // 3. Worker Status Transitions & Replies
  // ==========================================================================

  a2a
    .command("progress <task-id> <message>")
    .description("Report intermediary progress milestone (keeps state: working)")
    .option("-i, --identity <handle>", "Agent identity handle")
    .action(
      withErrorHandler(async function (
        this: Command,
        taskId: string,
        message: string,
        opts: { identity?: string }
      ) {
        const identity = await resolveIdentity(this, opts.identity);
        const task = await identity.a2a.tasks.progress(taskId, message);
        output(task, { json: !!getGlobalOpts(this).json });
      })
    );

  a2a
    .command("complete <task-id> <result>")
    .description("Finalize task successfully with deliverables (sets state: completed)")
    .option("-i, --identity <handle>", "Agent identity handle")
    .option("--artifact <filepath>", "Path to an artifact file to attach as deliverable")
    .action(
      withErrorHandler(async function (
        this: Command,
        taskId: string,
        result: string,
        opts: { identity?: string; artifact?: string }
      ) {
        const identity = await resolveIdentity(this, opts.identity);

        let artifacts;
        if (opts.artifact) {
          const filePath = path.resolve(process.cwd(), opts.artifact);
          if (!fs.existsSync(filePath)) {
            throw new Error(`Artifact file not found at: ${filePath}`);
          }
          const content = fs.readFileSync(filePath, "utf-8");
          const ext = path.extname(filePath).toLowerCase();
          const mimeType = ext === ".json" ? "application/json" : ext === ".md" ? "text/markdown" : "text/plain";
          artifacts = [
            {
              name: path.basename(filePath),
              mimeType,
              parts: [{ type: "text", text: content }],
            },
          ];
        }

        const task = await identity.a2a.tasks.complete(taskId, result, { artifacts });
        output(task, { json: !!getGlobalOpts(this).json });
      })
    );

  a2a
    .command("ask <task-id> <question>")
    .description("Request caller input and pause task execution (sets state: input-required)")
    .option("-i, --identity <handle>", "Agent identity handle")
    .action(
      withErrorHandler(async function (
        this: Command,
        taskId: string,
        question: string,
        opts: { identity?: string }
      ) {
        const identity = await resolveIdentity(this, opts.identity);
        const task = await identity.a2a.tasks.ask(taskId, question);
        output(task, { json: !!getGlobalOpts(this).json });
      })
    );

  a2a
    .command("fail <task-id> <reason>")
    .description("Terminate task execution with error explanation (sets state: failed)")
    .option("-i, --identity <handle>", "Agent identity handle")
    .action(
      withErrorHandler(async function (
        this: Command,
        taskId: string,
        reason: string,
        opts: { identity?: string }
      ) {
        const identity = await resolveIdentity(this, opts.identity);
        const task = await identity.a2a.tasks.fail(taskId, reason);
        output(task, { json: !!getGlobalOpts(this).json });
      })
    );

  a2a
    .command("reply <task-id>")
    .description("Generic task reply for scripts (supports --intent progress|complete|ask_caller|fail)")
    .requiredOption("--intent <intent>", "Lifecycle intent: progress, complete, ask_caller, or fail")
    .requiredOption("--text <text>", "Reply message text")
    .option("-i, --identity <handle>", "Agent identity handle")
    .action(
      withErrorHandler(async function (
        this: Command,
        taskId: string,
        opts: { intent: string; text: string; identity?: string }
      ) {
        const validIntents = ["progress", "complete", "ask_caller", "fail"];
        if (!validIntents.includes(opts.intent)) {
          throw new TypeError(`--intent must be one of: ${validIntents.join(", ")}`);
        }
        const identity = await resolveIdentity(this, opts.identity);
        const task = await identity.a2a.tasks.reply(taskId, {
          intent: opts.intent as A2AReplyIntent,
          text: opts.text,
        });
        output(task, { json: !!getGlobalOpts(this).json });
      })
    );

  // ==========================================================================
  // 4. Card & Settings
  // ==========================================================================

  a2a
    .command("card [agent]")
    .description("Show the public A2A Agent Card for an identity or remote URL")
    .option("-i, --identity <handle>", "Local agent identity handle")
    .action(
      withErrorHandler(async function (this: Command, agent?: string, opts?: { identity?: string }) {
        const target = agent || opts?.identity;
        if (target && (target.startsWith("http://") || target.startsWith("https://"))) {
          const client = createClient(getGlobalOpts(this));
          const resolved = await client.a2a.fetchCard(target);
          output(resolved.card, { json: !!getGlobalOpts(this).json });
          return;
        }

        const identity = await resolveIdentity(this, target);
        const card = await identity.a2a.card.get();
        output(card, { json: !!getGlobalOpts(this).json });
      })
    );

  a2a
    .command("settings [agent]")
    .description("View or update an identity's A2A channel settings")
    .option("-i, --identity <handle>", "Agent identity handle")
    .option("--enable", "Enable A2A receiver")
    .option("--disable", "Disable A2A receiver")
    .option("--skills-file <path>", "Path to JSON file containing skills array")
    .action(
      withErrorHandler(async function (
        this: Command,
        agent?: string,
        opts?: {
          identity?: string;
          enable?: boolean;
          disable?: boolean;
          skillsFile?: string;
        }
      ) {
        const identity = await resolveIdentity(this, agent || opts?.identity);

        if (opts?.enable) {
          await identity.a2a.settings.enable();
          console.log(`✅ A2A receiver enabled for @${identity.agent_handle}`);
        } else if (opts?.disable) {
          await identity.a2a.settings.disable();
          console.log(`🚫 A2A receiver disabled for @${identity.agent_handle}`);
        }

        if (opts?.skillsFile) {
          const filePath = path.resolve(process.cwd(), opts.skillsFile);
          const raw = fs.readFileSync(filePath, "utf-8");
          const parsed = JSON.parse(raw) as A2ASkill[];
          if (!Array.isArray(parsed)) {
            throw new TypeError("Skills file must contain a JSON array.");
          }
          await identity.a2a.settings.setSkills(parsed);
          console.log(`✅ Updated ${parsed.length} skills for @${identity.agent_handle}`);
        }

        const settings = await identity.a2a.settings.get();
        output(settings, { json: !!getGlobalOpts(this).json });
      })
    );
}
