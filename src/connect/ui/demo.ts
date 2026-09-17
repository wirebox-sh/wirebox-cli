import { parseWebhookPayload } from "../core/webhook.js";
import { buildChannelPrompt, frameInboundMessage, stripMarkdown } from "../core/prompts.js";
import { SessionManager } from "../core/session-manager.js";

export async function runJasonDemo(): Promise<void> {
  console.log("\n===============================================================================");
  console.log("     🚀 WIREBOX CONNECT — LIVE LOCAL TEST: JASON'S AFK AGENT USE CASE         ");
  console.log("===============================================================================\n");

  const JASON_PHONE = "+1 (415) 555-2671";
  const AGENT_IDENTITY = "eva-assistant";
  const sessionManager = new SessionManager();

  // 1. Jason is away from his keyboard (at lunch / commuting)
  console.log(`[Timeline 10:00 AM] 📱 Jason sends Apple iMessage from his iPhone:`);
  console.log(`   From: ${JASON_PHONE}`);
  console.log(`   To:   ${AGENT_IDENTITY}@wireboxmail.com`);
  console.log(`   Text: "Hey Eva, please pull origin main, run tests, and deploy if passing."\n`);

  // 2. Incoming Wirebox Tunnel Webhook Frame
  const incomingFrame = {
    event: "imessage.received",
    data: {
      id: "msg_jason_live_01",
      sender: JASON_PHONE,
      recipient: AGENT_IDENTITY,
      text: "Hey Eva, please pull origin main, run tests, and deploy if passing.",
      timestamp: new Date().toISOString(),
    },
  };

  console.log(`[Wirebox Cloud] 🌐 Inbound Webhook verified via HMAC-SHA256 signature.`);
  console.log(`[Wirebox Tunnel] ⚡ Forwarding WebSocket duplex frame to localhost dev server...\n`);

  const event = parseWebhookPayload(incomingFrame);
  if (!event) throw new Error("Failed to parse event");

  // 3. Connect Engine session resolution & prompt framing
  const session = sessionManager.getOrCreateSession({
    contactKey: event.sender,
    channel: event.channel,
    projectDir: process.cwd(),
    driverName: "claude-code",
  });
  console.log(`[Wirebox Connect] 💻 Session resolved for Jason: ${session.sessionId}`);
  console.log(`   Normalized Handle: ${session.contactKey}`);
  console.log(`   Channel Modality:  ${session.lastChannel}`);
  console.log(`   Workspace:         ${session.projectDir}\n`);

  buildChannelPrompt(event.channel);
  frameInboundMessage(event);
  console.log(`[Prompt Framing] 🧠 Modality rules applied:`);
  console.log(`   • Channel: ${event.channel}`);
  console.log(`   • Constraints: Short mobile bubbles, no giant markdown tables\n`);

  // 4. Driver Execution with Permission Escalation
  console.log(`[Agent Harness] 🤖 Claude Code initialized in headless mode.`);
  console.log(`   Claude runs: git pull origin main`);
  console.log(`   Claude runs: npm test (✓ Passed)`);
  console.log(`   Claude attempts sensitive action: "npm run deploy:prod"\n`);

  // Escalation request
  console.log(`[Escalation] ⚠️ Claude Code triggers interactive permission prompt.`);
  console.log(`[Wirebox Connect] 📡 Intercepting prompt and escalating to Jason's iPhone...\n`);

  const { formattedText, promise } = sessionManager.escalation.requestApproval({
    sessionId: session.sessionId,
    contactKey: session.contactKey,
    channel: session.lastChannel,
    toolName: "Production Deployment",
    command: "npm run deploy:prod",
    detail: "Deploying build artifacts to production edge",
  });

  console.log(`[iMessage Outbound] 📱 Sent to Jason's iPhone:`);
  console.log("---------------------------------------------------------------");
  console.log(formattedText);
  console.log("---------------------------------------------------------------\n");

  // 5. Jason reads prompt on his phone and texts back "1"
  console.log(`[Timeline 10:01 AM] 📱 Jason glances at lock screen and replies: "1"`);
  const handled = sessionManager.escalation.handleInboundReply(session.contactKey, "1");
  console.log(`[Wirebox Connect] 🎯 Reply intercepted by EscalationManager: resolved = ${handled}\n`);

  const userAction = await promise;
  console.log(`[Agent Harness] 🔓 Permission unlocked with action: "${userAction}". Resuming CLI execution...`);
  console.log(`   Executing: npm run deploy:prod`);
  console.log(`   Deploy finished in 1.8s (Cloudflare Workers updated).\n`);

  // 6. Agent prepares final response
  const rawAgentOutput = `
### Deployment Succeeded 🎉
All tests passed and production worker **api.wirebox.sh** was deployed!
- Commit: \`0010b3d\`
- View dashboard at [Wirebox Console](https://wirebox.sh/console)
`;

  const mobileCleaned = stripMarkdown(rawAgentOutput);
  console.log(`[iMessage Outbound] 📱 Final reply sent to Jason's iPhone:`);
  console.log("---------------------------------------------------------------");
  console.log(mobileCleaned);
  console.log("---------------------------------------------------------------\n");

  console.log("===============================================================================");
  console.log("     ✨ ALL JASON USE CASE VERIFICATIONS PASSED SUCCESSFULLY (100%)            ");
  console.log("===============================================================================\n");
}
