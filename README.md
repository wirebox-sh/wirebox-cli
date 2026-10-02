# @wirebox-sh/cli

> The official command-line interface for [Wirebox](https://wirebox.sh) — the real-world identity, communication, and context execution layer for AI agents.

[![npm version](https://img.shields.io/npm/v/@wirebox-sh/cli.svg)](https://www.npmjs.com/package/@wirebox-sh/cli)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

Equip autonomous AI agents with phone numbers, voice streaming, SMS, and email inboxes directly from the terminal or subshell.

---

## Installation

```bash
npm install -g @wirebox-sh/cli
# or run directly with npx:
npx @wirebox-sh/cli --help
```

---

## Global Options

The following flags are available across all commands:

| Flag | Description |
| :--- | :--- |
| `--api-key <key>` | Wirebox API key (or set `WIREBOX_API_KEY`) |
| `--base-url <url>` | Override API base URL (or set `WIREBOX_BASE_URL`) |
| `--json` | Output response in structured JSON format for scripts and agents |
| `-h, --help` | Display help for command |
| `-V, --version` | Display version number |

---

## Commands & Usage

### 1. Zero-Setup Agent Self-Signup

An agent running inside a sandbox or container can bootstrap itself without a pre-existing API key:

```bash
# Register a new agent identity and mailbox
wirebox signup \
  --human-email supervisor@company.com \
  --display-name "Review Bot" \
  --note "Please verify my Wirebox mailbox."

# Output:
# 🎉 Agent registered successfully!
# Email Address : agent-a1b2c3@wireboxmail.com
# Secret API Key: wb_live_...
# Status        : Unclaimed (6-digit OTP code sent to supervisor)

# Verify with the OTP code received by the human
wirebox verify --code 582194 --api-key wb_live_...
```

---

### 2. Caller Introspection (`whoami`)

Check your current organization, active key, and resource quotas:

```bash
wirebox whoami

# Machine-readable output for scripts:
wirebox whoami --json
```

---

### 3. Identity Management (`wirebox identity` / `wirebox id`)

```bash
# Provision a new identity with dedicated inbox
wirebox identity create --handle sales-bot --display-name "Sales Assistant"

# List identities in organization
wirebox identity list
# (or short alias)
wirebox id list

# Inspect identity details
wirebox identity get sales-bot

# Update profile
wirebox identity update sales-bot --display-name "Senior Sales Assistant"

# Delete identity
wirebox identity delete sales-bot
```

---

### 4. Mail Communication (`wirebox mail`)

```bash
# Send an outbound email
wirebox mail send \
  -i sales-bot \
  --to client@example.com \
  --subject "Weekly Status" \
  --text "Everything is on track."

# Send email with attachments
wirebox mail send \
  -i sales-bot \
  --to client@example.com \
  --subject "Invoice" \
  --text "Please find invoice attached." \
  --attach ./invoice.pdf

# List messages in inbox
wirebox mail list -i sales-bot --limit 10

# Read full email body and headers
wirebox mail get -i sales-bot <message-id>

# Reply to an email
wirebox mail reply -i sales-bot <message-id> \
  --text "Received, thank you!"

# Delete a message
wirebox mail delete -i sales-bot <message-id>
```

---

### 5. Phone & SMS Numbers (`wirebox phone`)

Provision local phone numbers and send/read SMS/MMS messages:

```bash
# Provision a dedicated phone number for an agent
wirebox phone provision --handle sales-bot --country US

# List provisioned numbers in organization
wirebox phone numbers

# Send an outbound SMS
wirebox phone send --from +15551234567 --to +15559876543 --text "Your verification code is 123456"

# List recent SMS messages
wirebox phone messages --limit 10
```

---

### 6. iMessage Communication (`wirebox imessage`)

Equip agents with real-world iMessage reachability:

```bash
# Display the iMessage router QR code & connection string
wirebox imessage router --agent sales-bot

# List active iMessage conversations
wirebox imessage list -i sales-bot

# Send an iMessage to an active conversation
wirebox imessage send -i sales-bot --to +15559876543 --text "Hello over iMessage!"
```

---

### 7. Network Tunnels (`wirebox tunnel`)

Expose local development servers to the internet with agent-branded public URLs:

```bash
# Connect local port 3000 to the agent's public tunnel URL
wirebox tunnel connect sales-bot --port 3000

# Inspect active tunnel telemetry
wirebox tunnel get sales-bot
```

---

### 8. Webhook Subscriptions (`wirebox webhook`)

```bash
# Create a webhook endpoint for real-time events
wirebox webhook create \
  --url https://api.myagent.com/webhooks \
  --events message.received,imessage.received

# List registered webhooks
wirebox webhook list
```

---

## Agent & MCP Integration

Wirebox Core provides a native **Streamable HTTP MCP (Model Context Protocol)** endpoint at `https://api.wirebox.sh/api/v1/mcp`. Autonomous agents (Claude Code, Cursor, Windsurf) can connect directly to Wirebox with zero local background processes:

```bash
# Add Wirebox MCP tools directly to Claude Code
claude mcp add wirebox https://api.wirebox.sh/api/v1/mcp -H "Authorization: Bearer $WIREBOX_API_KEY"
```

For shell scripting and tool use, use `--json` for structured output:

```bash
wirebox mail list -i sales-bot --json | jq '.messages[0].subject'
```

---

## License

MIT © [Wirebox Team](https://wirebox.sh)
