/**
 * Wirebox CLI - Mail Rules & Security Guardrails Commands
 *
 * Provides channel-scoped inbound prompt-injection defense and outbound data-exfiltration
 * defense commands for agent identities.
 */

import {
  NotFoundError,
  type InboundMailPolicy,
  type MailRuleAction,
  type MailRuleDirection,
  type OutboundMailPolicy,
} from "@wirebox-sh/sdk";
import type { Command } from "commander";
import { createClient, getGlobalOpts } from "../client.js";
import { withErrorHandler } from "../errors.js";
import { output, printTable } from "../output.js";

const RULE_COLUMNS = ["target", "direction", "action", "reason", "status", "id"];

function resolveTarget(
  arg1?: string,
  arg2?: string,
  flagIdentity?: string
): { handle?: string; entry: string } {
  if (arg2) {
    return { handle: arg1, entry: arg2 };
  }
  if (!arg1) {
    throw new Error("Target email or domain entry is required.");
  }
  return { handle: flagIdentity, entry: arg1 };
}

function resolveHandle(posHandle?: string, flagHandle?: string): string | undefined {
  return posHandle || flagHandle;
}

function formatPolicyDisplay(inbound: string, outbound: string) {
  const inText =
    inbound === "protected"
      ? "🛡️  PROTECTED  (Only approved senders & thread replies; strangers quarantined)"
      : "🌐 OPEN       (Accepts emails from anyone on the internet)";

  const outText =
    outbound === "restricted"
      ? "🛡️  RESTRICTED (Only approved contacts & domains; unauthorized outbound blocked)"
      : "🌐 OPEN       (Agent can send emails to any external address)";

  return { inText, outText };
}

export function registerMailRulesCommands(mail: Command): void {
  function attachRulesCommands(rules: Command) {
    // 1. list [handle]
    rules
      .command("list [handle]")
      .description("List active mail rules and security policy posture for an agent identity")
      .option("-i, --identity <handle>", "Agent identity handle (defaults to scoped identity)")
      .option("--direction <dir>", "Filter by direction: inbound, outbound, or both")
      .option("--action <act>", "Filter by action: allow or block")
      .option("--limit <n>", "Maximum records to return", (v) => parseInt(v, 10))
      .option("--offset <n>", "Pagination offset", (v) => parseInt(v, 10))
      .action(
        withErrorHandler(async function (
          this: Command,
          posHandle: string | undefined,
          cmdOpts: {
            identity?: string;
            direction?: string;
            action?: string;
            limit?: number;
            offset?: number;
          }
        ) {
          const opts = getGlobalOpts(this);
          const client = createClient(opts);
          const agent = await client.getIdentity(resolveHandle(posHandle, cmdOpts.identity));

          const res = await client.mailRules.list(agent.agent_handle, {
            direction: cmdOpts.direction as MailRuleDirection | undefined,
            action: cmdOpts.action as MailRuleAction | undefined,
            limit: cmdOpts.limit,
            offset: cmdOpts.offset,
          });

          if (opts.json) {
            output(
              {
                identity: {
                  handle: agent.agent_handle,
                  email: agent.mailbox.email_address,
                },
                policy: agent.mailPolicy,
                rules: res.rules,
                total: res.total,
              },
              { json: true }
            );
            return;
          }

          const { inText, outText } = formatPolicyDisplay(
            agent.mailPolicy.inbound,
            agent.mailPolicy.outbound
          );

          console.log(`\nAgent: @${agent.agent_handle} (${agent.mailbox.email_address})`);
          console.log("Security Policy:");
          console.log(`  Inbound:   ${inText}`);
          console.log(`  Outbound:  ${outText}\n`);

          if (res.rules.length === 0) {
            console.log("No custom rules configured yet.");
            return;
          }

          console.log(`Active Rules (${res.rules.length}):`);
          const rows = res.rules.map((r) => ({
            target: r.entry,
            direction: r.direction.toUpperCase(),
            action: r.action === "allow" ? "✓ ALLOW" : "✕ BLOCK",
            reason: r.reason || "-",
            status: r.status,
            id: r.id,
          }));

          printTable(rows, RULE_COLUMNS);
        })
      );

    // 2. allow [handle] <entry>
    rules
      .command("allow [identity_or_entry] [entry]")
      .description("Allow an email address or domain for an agent identity")
      .option("-i, --identity <handle>", "Agent identity handle")
      .option("--inbound", "Apply allow rule to inbound emails only")
      .option("--outbound", "Apply allow rule to outbound emails only")
      .option("--direction <dir>", "Rule direction: inbound, outbound, or both", "both")
      .option("--reason <text>", "Audit reason or description for this rule")
      .action(
        withErrorHandler(async function (
          this: Command,
          arg1: string | undefined,
          arg2: string | undefined,
          cmdOpts: {
            identity?: string;
            inbound?: boolean;
            outbound?: boolean;
            direction?: string;
            reason?: string;
          }
        ) {
          const opts = getGlobalOpts(this);
          const client = createClient(opts);
          const { handle, entry } = resolveTarget(arg1, arg2, cmdOpts.identity);
          const agent = await client.getIdentity(handle);

          let direction: MailRuleDirection = "both";
          if (cmdOpts.inbound) direction = "inbound";
          else if (cmdOpts.outbound) direction = "outbound";
          else if (cmdOpts.direction) direction = cmdOpts.direction as MailRuleDirection;

          const rule = await client.mailRules.allow(agent.agent_handle, entry, {
            direction,
            reason: cmdOpts.reason,
          });

          if (opts.json) {
            output(rule, { json: true });
            return;
          }

          console.log(`\n✓ Allowed '${rule.entry}' for @${agent.agent_handle}`);
          console.log(`  Rule ID:   ${rule.id}`);
          console.log(`  Direction: ${rule.direction.toUpperCase()}`);
          if (rule.reason) console.log(`  Reason:    ${rule.reason}`);
          console.log();
        })
      );

    // 3. block [handle] <entry>
    rules
      .command("block [identity_or_entry] [entry]")
      .description("Block an email address or domain for an agent identity")
      .option("-i, --identity <handle>", "Agent identity handle")
      .option("--inbound", "Apply block rule to inbound emails only")
      .option("--outbound", "Apply block rule to outbound emails only")
      .option("--direction <dir>", "Rule direction: inbound, outbound, or both", "both")
      .option("--reason <text>", "Audit reason or description for this rule")
      .action(
        withErrorHandler(async function (
          this: Command,
          arg1: string | undefined,
          arg2: string | undefined,
          cmdOpts: {
            identity?: string;
            inbound?: boolean;
            outbound?: boolean;
            direction?: string;
            reason?: string;
          }
        ) {
          const opts = getGlobalOpts(this);
          const client = createClient(opts);
          const { handle, entry } = resolveTarget(arg1, arg2, cmdOpts.identity);
          const agent = await client.getIdentity(handle);

          let direction: MailRuleDirection = "both";
          if (cmdOpts.inbound) direction = "inbound";
          else if (cmdOpts.outbound) direction = "outbound";
          else if (cmdOpts.direction) direction = cmdOpts.direction as MailRuleDirection;

          const rule = await client.mailRules.block(agent.agent_handle, entry, {
            direction,
            reason: cmdOpts.reason,
          });

          if (opts.json) {
            output(rule, { json: true });
            return;
          }

          console.log(`\n✕ Blocked '${rule.entry}' for @${agent.agent_handle}`);
          console.log(`  Rule ID:   ${rule.id}`);
          console.log(`  Direction: ${rule.direction.toUpperCase()}`);
          if (rule.reason) console.log(`  Reason:    ${rule.reason}`);
          console.log();
        })
      );

    // 4. add [handle] <entry> (full specification)
    rules
      .command("add [identity_or_entry] [entry]")
      .description("Add a mail rule with full parameter control")
      .option("-i, --identity <handle>", "Agent identity handle")
      .option("--allow", "Set rule action to allow (default)")
      .option("--block", "Set rule action to block")
      .option("--action <action>", "Rule action: allow or block", "allow")
      .option("--inbound", "Inbound direction only")
      .option("--outbound", "Outbound direction only")
      .option("--direction <dir>", "Rule direction: inbound, outbound, or both", "both")
      .option("--reason <text>", "Audit reason or description")
      .action(
        withErrorHandler(async function (
          this: Command,
          arg1: string | undefined,
          arg2: string | undefined,
          cmdOpts: {
            identity?: string;
            allow?: boolean;
            block?: boolean;
            action?: string;
            inbound?: boolean;
            outbound?: boolean;
            direction?: string;
            reason?: string;
          }
        ) {
          const opts = getGlobalOpts(this);
          const client = createClient(opts);
          const { handle, entry } = resolveTarget(arg1, arg2, cmdOpts.identity);
          const agent = await client.getIdentity(handle);

          let action: MailRuleAction = "allow";
          if (cmdOpts.block) action = "block";
          else if (cmdOpts.action === "block") action = "block";

          let direction: MailRuleDirection = "both";
          if (cmdOpts.inbound) direction = "inbound";
          else if (cmdOpts.outbound) direction = "outbound";
          else if (cmdOpts.direction) direction = cmdOpts.direction as MailRuleDirection;

          const rule = await client.mailRules.create(agent.agent_handle, {
            entry,
            action,
            direction,
            reason: cmdOpts.reason,
          });

          if (opts.json) {
            output(rule, { json: true });
            return;
          }

          const actionLabel = rule.action === "allow" ? "✓ Allowed" : "✕ Blocked";
          console.log(`\n${actionLabel} '${rule.entry}' for @${agent.agent_handle}`);
          console.log(`  Rule ID:   ${rule.id}`);
          console.log(`  Direction: ${rule.direction.toUpperCase()}`);
          if (rule.reason) console.log(`  Reason:    ${rule.reason}`);
          console.log();
        })
      );

    // 5. remove [handle] <target_or_id>
    rules
      .command("remove [identity_or_target] [target_or_id]")
      .description("Remove a mail rule by entry email/domain or rule ID")
      .option("-i, --identity <handle>", "Agent identity handle")
      .action(
        withErrorHandler(async function (
          this: Command,
          arg1: string | undefined,
          arg2: string | undefined,
          cmdOpts: { identity?: string }
        ) {
          const opts = getGlobalOpts(this);
          const client = createClient(opts);
          const { handle, entry: target } = resolveTarget(arg1, arg2, cmdOpts.identity);
          const agent = await client.getIdentity(handle);

          if (target.startsWith("mrl_")) {
            const res = await client.mailRules.delete(agent.agent_handle, target);
            if (opts.json) {
              output(res, { json: true });
              return;
            }
            console.log(`\n✓ Deleted rule '${target}' from @${agent.agent_handle}.\n`);
            return;
          }

          // Match by entry
          const { rules: existing } = await client.mailRules.list(agent.agent_handle);
          const cleanTarget = target.trim().toLowerCase();
          const matched = existing.filter(
            (r) =>
              r.entry.toLowerCase() === cleanTarget ||
              r.match_target.toLowerCase() === cleanTarget
          );

          if (matched.length === 0) {
            throw new NotFoundError(
              404,
              "rule_not_found",
              `No mail rule matching '${target}' found on @${agent.agent_handle}.`
            );
          }

          for (const rule of matched) {
            await client.mailRules.delete(agent.agent_handle, rule.id);
          }

          if (opts.json) {
            output({ deleted: true, count: matched.length, target }, { json: true });
            return;
          }

          console.log(
            `\n✓ Deleted ${matched.length} rule(s) matching '${target}' from @${agent.agent_handle}.\n`
          );
        })
      );
  }

  function attachPolicyCommands(policy: Command) {
    // 1. policy get [handle]
    policy
      .command("get [handle]")
      .description("Get current inbound and outbound mail security policy for an agent")
      .option("-i, --identity <handle>", "Agent identity handle")
      .action(
        withErrorHandler(async function (
          this: Command,
          posHandle: string | undefined,
          cmdOpts: { identity?: string }
        ) {
          const opts = getGlobalOpts(this);
          const client = createClient(opts);
          const agent = await client.getIdentity(resolveHandle(posHandle, cmdOpts.identity));
          const p = await client.mailRules.getPolicy(agent.agent_handle);

          if (opts.json) {
            output(p, { json: true });
            return;
          }

          const { inText, outText } = formatPolicyDisplay(p.inbound, p.outbound);
          console.log(`\nAgent: @${agent.agent_handle} (${agent.mailbox.email_address})`);
          console.log("Security Policy:");
          console.log(`  Inbound:   ${inText}`);
          console.log(`  Outbound:  ${outText}\n`);
        })
      );

    // 2. policy set [handle]
    policy
      .command("set [handle]")
      .description("Set inbound and outbound mail security policies for an agent")
      .option("-i, --identity <handle>", "Agent identity handle")
      .option("--inbound <mode>", "Inbound posture: protected or open")
      .option("--outbound <mode>", "Outbound posture: restricted or open")
      .action(
        withErrorHandler(async function (
          this: Command,
          posHandle: string | undefined,
          cmdOpts: { identity?: string; inbound?: string; outbound?: string }
        ) {
          const opts = getGlobalOpts(this);
          const client = createClient(opts);
          const agent = await client.getIdentity(resolveHandle(posHandle, cmdOpts.identity));

          if (!cmdOpts.inbound && !cmdOpts.outbound) {
            throw new Error("Must specify at least one of --inbound or --outbound.");
          }

          const updated = await client.mailRules.setPolicy(agent.agent_handle, {
            inbound: cmdOpts.inbound as InboundMailPolicy | undefined,
            outbound: cmdOpts.outbound as OutboundMailPolicy | undefined,
          });

          if (opts.json) {
            output(updated, { json: true });
            return;
          }

          const { inText, outText } = formatPolicyDisplay(updated.inbound, updated.outbound);
          console.log(`\n✓ Updated security policy for @${agent.agent_handle}:`);
          console.log(`  Inbound:   ${inText}`);
          console.log(`  Outbound:  ${outText}\n`);
        })
      );
  }

  // Mount under wirebox mail rules / policy
  const rules = mail
    .command("rules")
    .description("Mail allowlist and blocklist security rules for agent identities");
  attachRulesCommands(rules);

  const policy = mail
    .command("policy")
    .description("Inbound and outbound email security policies for agent identities");
  attachPolicyCommands(policy);
}
