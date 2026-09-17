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

### 5. Mobile & Desktop Agent Connect (`wirebox connect`)

Bridge phone iMessage, SMS, and email directly to local AI coding agents running on your machine:

```bash
# Check installed agent drivers (Claude Code, Hermes, OpenAI Codex, OpenCode)
wirebox connect drivers

# Run connectivity diagnostics
wirebox connect doctor

# Connect phone iMessage & email directly to local Claude Code agent
wirebox connect @sales-bot --driver claude-code

# Connect to Hermes Agent with session memory
wirebox connect @sales-bot --driver hermes

# First-time interactive setup wizard
wirebox connect init

# Install as background macOS daemon (starts on boot via launchd)
wirebox connect daemon install
wirebox connect daemon status
wirebox connect daemon logs
```

---

## Output Formats & Agent Integration

By default, the CLI formats responses into readable ASCII tables and records.

When invoked with `--json`, output is formatted as indented JSON, ideal for piping to `jq` or direct consumption by AI agents (e.g. Claude Code bash tools):

```bash
wirebox mail list -i sales-bot --json | jq '.messages[0].subject'
```

---

## License

MIT © [Wirebox Team](https://wirebox.sh)
