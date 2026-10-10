/**
 * Wirebox CLI - Vault Commands
 *
 * Encrypted credential vault. All crypto happens client-side in the SDK; the
 * CLI only resolves the vault key (never sending it to the API) and renders
 * results, masking secrets by default.
 *
 * Vault key resolution (for unlock/encrypt operations): `--vault-key`, else the
 * WIREBOX_VAULT_KEY environment variable, else an interactive hidden prompt
 * when attached to a TTY.
 *
 * Secret-value flags (`--password`, `--key`, `--data`) take an OPTIONAL value:
 *   --password <v>   use this literal value
 *   --password -     read one line from stdin (for pipes)
 *   --password       (no value) prompt interactively with hidden input
 *   (omitted)        leave the field unset (or, for required fields, prompt)
 */

import * as readline from "node:readline";
import {
  parseTotpUri,
  VaultSecretType,
  type ApiKeyPayload,
  type LoginPayload,
  type OtherPayload,
  type SecretPayload,
} from "@wirebox-sh/sdk";
import type { Command } from "commander";
import { createClient, getGlobalOpts } from "../client.js";
import { withErrorHandler } from "../errors.js";
import { output } from "../output.js";

const SECRET_COLUMNS = ["id", "type", "name", "description", "updated_at"];
const ACCESS_COLUMNS = ["id", "identity_id", "created_at"];

/** A secret-value flag: a literal string, `true` (flag present without value), or undefined. */
type SecretFlag = string | boolean | undefined;

// ---------------------------------------------------------------------------
// Secret input: literal, "-" for stdin, or an interactive hidden prompt
// ---------------------------------------------------------------------------

function readStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = "";
    process.stdin.setEncoding("utf-8");
    process.stdin.on("data", (chunk) => (data += chunk));
    process.stdin.on("end", () => resolve(data.replace(/\r?\n$/, "")));
    process.stdin.on("error", reject);
  });
}

function promptHidden(label: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const mutable = rl as unknown as { output?: { write: (s: string) => void }; _writeToOutput?: (s: string) => void };
    let wroteLabel = false;
    mutable._writeToOutput = (str: string) => {
      if (!wroteLabel) {
        mutable.output?.write(str);
        wroteLabel = true;
      }
    };
    rl.question(`${label}: `, (answer) => {
      rl.close();
      process.stdout.write("\n");
      resolve(answer);
    });
  });
}

/**
 * Resolve a secret-value flag to its final value.
 * - `undefined`: field not provided. Prompts when `required`, else returns undefined.
 * - `true` (flag present, no value): always prompt (hidden).
 * - `"-"`: read a line from stdin.
 * - string: use literally.
 */
async function resolveSecret(flag: SecretFlag, label: string, required = false): Promise<string | undefined> {
  if (flag === undefined) {
    if (!required) return undefined;
    if (!process.stdin.isTTY) {
      throw new Error(`Missing ${label}. Pass the flag, pipe it with "${flagHint(label)} -", or run interactively.`);
    }
    return promptHidden(label);
  }
  if (flag === true) {
    if (!process.stdin.isTTY) throw new Error(`Cannot prompt for ${label}: no interactive terminal.`);
    return promptHidden(label);
  }
  if (flag === "-") return (await readStdin()).trim();
  return typeof flag === "string" ? flag : undefined;
}

function flagHint(label: string): string {
  return label === "API key" ? "--key" : label === "Data" ? "--data" : "--password";
}

function resolveVaultKey(cmdVaultKey?: string): Promise<string> {
  const key = cmdVaultKey ?? process.env.WIREBOX_VAULT_KEY;
  if (key) return Promise.resolve(key);
  if (!process.stdin.isTTY) {
    throw new Error("Vault key required. Pass --vault-key or set WIREBOX_VAULT_KEY.");
  }
  return promptHidden("Vault key");
}

// ---------------------------------------------------------------------------
// Payload assembly & masking
// ---------------------------------------------------------------------------

interface FieldFlags {
  username?: string;
  email?: string;
  password?: SecretFlag;
  url?: string;
  totpUri?: string;
  key?: SecretFlag;
  data?: SecretFlag;
}

/** Build a brand-new payload for `add`. Required fields prompt when omitted. */
async function buildNewPayload(type: VaultSecretType, flags: FieldFlags): Promise<SecretPayload> {
  if (type === VaultSecretType.LOGIN) {
    const payload: LoginPayload = {};
    if (flags.username !== undefined) payload.username = flags.username;
    if (flags.email !== undefined) payload.email = flags.email;
    const password = await resolveSecret(flags.password, "Password");
    if (password !== undefined) payload.password = password;
    if (flags.url !== undefined) payload.service_url = flags.url;
    if (flags.totpUri !== undefined) payload.totp = parseTotpUri(flags.totpUri);
    return payload;
  }
  if (type === VaultSecretType.API_KEY) {
    const key = await resolveSecret(flags.key, "API key", true);
    const payload: ApiKeyPayload = { key: key! };
    if (flags.url !== undefined) payload.service_url = flags.url;
    return payload;
  }
  const data = await resolveSecret(flags.data, "Data", true);
  return { data: data! } satisfies OtherPayload;
}

/** Merge flag overrides onto an existing payload for `set`, preserving untouched fields. */
async function applyUpdates(type: VaultSecretType, existing: SecretPayload, flags: FieldFlags): Promise<SecretPayload> {
  if (type === VaultSecretType.LOGIN) {
    const p = { ...(existing as LoginPayload) };
    if (flags.username !== undefined) p.username = flags.username;
    if (flags.email !== undefined) p.email = flags.email;
    if (flags.password !== undefined) {
      const password = await resolveSecret(flags.password, "Password");
      if (password !== undefined) p.password = password;
    }
    if (flags.url !== undefined) p.service_url = flags.url;
    if (flags.totpUri !== undefined) p.totp = parseTotpUri(flags.totpUri);
    return p;
  }
  if (type === VaultSecretType.API_KEY) {
    const p = { ...(existing as ApiKeyPayload) };
    if (flags.key !== undefined) {
      const key = await resolveSecret(flags.key, "API key", true);
      if (key !== undefined) p.key = key;
    }
    if (flags.url !== undefined) p.service_url = flags.url;
    return p;
  }
  const p = { ...(existing as OtherPayload) };
  if (flags.data !== undefined) {
    const data = await resolveSecret(flags.data, "Data", true);
    if (data !== undefined) p.data = data;
  }
  return p;
}

const SENSITIVE_FIELDS: Record<string, string[]> = {
  login: ["password"],
  api_key: ["key"],
  other: ["data"],
};

function maskPayload(type: string, payload: Record<string, unknown>): Record<string, unknown> {
  const masked: Record<string, unknown> = {};
  const sensitive = SENSITIVE_FIELDS[type] ?? [];
  for (const [k, v] of Object.entries(payload)) {
    if (k === "totp" && v && typeof v === "object") masked.totp = "configured";
    else if (sensitive.includes(k) && v) masked[k] = "********";
    else masked[k] = v;
  }
  return masked;
}

function assertType(value: string): VaultSecretType {
  if (value === "login" || value === "api_key" || value === "other") return value;
  throw new Error(`Invalid --type '${value}'. Must be one of: login, api_key, other.`);
}

const PAYLOAD_FLAG_KEYS = ["username", "email", "password", "url", "totpUri", "key", "data"] as const;

// ---------------------------------------------------------------------------
// Command registration
// ---------------------------------------------------------------------------

/** Resolve a secret name or id to its id. Ids (vsec_...) pass through; names are matched via metadata. */
async function resolveSecretId(client: ReturnType<typeof createClient>, nameOrId: string): Promise<string> {
  if (nameOrId.startsWith("vsec_")) return nameOrId;
  const secrets = await client.vault.listSecrets();
  const matches = secrets.filter((s) => s.name.toLowerCase() === nameOrId.toLowerCase());
  if (matches.length === 1) return matches[0]!.id;
  if (matches.length > 1) {
    throw new Error(`Multiple secrets are named '${nameOrId}'. Use the secret id (vsec_...) to disambiguate.`);
  }
  throw new Error(`No secret named or identified by '${nameOrId}'.`);
}

/** Resolve an agent handle (@eva or eva) or id (agt_...) to its identity id. */
async function resolveIdentityId(client: ReturnType<typeof createClient>, handleOrId: string): Promise<string> {
  if (handleOrId.startsWith("agt_")) return handleOrId;
  const identity = await client.getIdentity(handleOrId.replace(/^@/, ""));
  return identity.id;
}

export function registerVaultCommands(program: Command): void {
  const vault = program.command("vault").description("Encrypted credential vault for agent identities");

  vault
    .command("init")
    .description("Initialize the organization vault (generates a vault key if none is given)")
    .option("--vault-key <key>", "Use a specific vault key instead of a generated one")
    .action(
      withErrorHandler(async function (this: Command, cmdOpts: { vaultKey?: string }) {
        const opts = getGlobalOpts(this);
        const result = await createClient(opts).vault.initialize(cmdOpts.vaultKey);
        if (opts.json) {
          output({ vault_key: result.vaultKey, info: result.info, warning: result.warning }, { json: true });
          return;
        }
        console.log("Vault initialized.\n");
        console.log(`  Vault key: ${result.vaultKey}`);
        console.log(`\n  ⚠️  ${result.warning}\n`);
      })
    );

  vault
    .command("info")
    .description("Show vault status and KDF parameters")
    .action(
      withErrorHandler(async function (this: Command) {
        const opts = getGlobalOpts(this);
        const info = await createClient(opts).vault.info();
        output(info as unknown as Record<string, unknown>, { json: !!opts.json });
      })
    );

  vault
    .command("list")
    .description("List vault secrets (metadata only, no ciphertext)")
    .option("--type <type>", "Filter by type: login, api_key, or other")
    .action(
      withErrorHandler(async function (this: Command, cmdOpts: { type?: VaultSecretType }) {
        const opts = getGlobalOpts(this);
        const secrets = await createClient(opts).vault.listSecrets({ type: cmdOpts.type });
        output(secrets as unknown as Record<string, unknown>[], { json: !!opts.json, columns: SECRET_COLUMNS });
      })
    );

  vault
    .command("get <name-or-id>")
    .description("Get a secret; secret values are masked unless --reveal is set")
    .option("--vault-key <key>", "Vault key (or set WIREBOX_VAULT_KEY)")
    .option("--field <name>", "Print only this payload field's raw value")
    .option("--reveal", "Reveal secret values in plaintext", false)
    .action(
      withErrorHandler(async function (
        this: Command,
        secretId: string,
        cmdOpts: { vaultKey?: string; field?: string; reveal?: boolean }
      ) {
        const opts = getGlobalOpts(this);
        const vaultKey = await resolveVaultKey(cmdOpts.vaultKey);
        const unlocked = await createClient(opts).vault.unlock(vaultKey);
        const secret = unlocked.getSecret(secretId);
        const payload = secret.payload as unknown as Record<string, unknown>;

        if (cmdOpts.field) {
          const value = payload[cmdOpts.field];
          if (value === undefined) throw new Error(`Secret '${secretId}' has no field '${cmdOpts.field}'.`);
          process.stdout.write((typeof value === "object" ? JSON.stringify(value) : String(value)) + "\n");
          return;
        }

        output(
          {
            id: secret.id,
            type: secret.type,
            name: secret.name,
            description: secret.description,
            payload: cmdOpts.reveal ? payload : maskPayload(secret.type, payload),
          },
          { json: !!opts.json }
        );
      })
    );

  vault
    .command("add")
    .description("Add a new secret (encrypted client-side before upload)")
    .requiredOption("--type <type>", "Secret type: login, api_key, or other")
    .requiredOption("--name <name>", "Human-readable label")
    .option("--description <text>", "Optional description")
    .option("--vault-key <key>", "Vault key (or set WIREBOX_VAULT_KEY)")
    .option("--username <user>", "Username (login)")
    .option("--email <email>", "Email (login)")
    .option("--password [pass]", "Password (login); no value prompts, '-' reads stdin")
    .option("--url <url>", "Associated service URL (login, api_key)")
    .option("--totp-uri <uri>", "otpauth:// TOTP provisioning URI (login)")
    .option("--key [value]", "API key value (api_key); no value prompts, '-' reads stdin")
    .option("--data [value]", "Freeform data (other); no value prompts, '-' reads stdin")
    .action(
      withErrorHandler(async function (
        this: Command,
        cmdOpts: FieldFlags & { type: string; name: string; description?: string; vaultKey?: string }
      ) {
        const opts = getGlobalOpts(this);
        const type = assertType(cmdOpts.type);
        const payload = await buildNewPayload(type, cmdOpts);
        const vaultKey = await resolveVaultKey(cmdOpts.vaultKey);
        const unlocked = await createClient(opts).vault.unlock(vaultKey);
        const secret = await unlocked.createSecret({
          type,
          name: cmdOpts.name,
          description: cmdOpts.description,
          payload,
        });
        if (opts.json) output({ id: secret.id, type: secret.type, name: secret.name }, { json: true });
        else console.log(`Added ${secret.type} secret '${secret.name}' (${secret.id}).`);
      })
    );

  vault
    .command("set <name-or-id>")
    .description("Update a secret's metadata and/or payload fields")
    .option("--vault-key <key>", "Vault key (or set WIREBOX_VAULT_KEY)")
    .option("--name <name>", "New label")
    .option("--description <text>", "New description")
    .option("--username <user>", "Username (login)")
    .option("--email <email>", "Email (login)")
    .option("--password [pass]", "Password (login); no value prompts, '-' reads stdin")
    .option("--url <url>", "Associated service URL")
    .option("--totp-uri <uri>", "otpauth:// TOTP provisioning URI (login)")
    .option("--key [value]", "API key value (api_key); no value prompts, '-' reads stdin")
    .option("--data [value]", "Freeform data (other); no value prompts, '-' reads stdin")
    .action(
      withErrorHandler(async function (
        this: Command,
        secretId: string,
        cmdOpts: FieldFlags & { vaultKey?: string; name?: string; description?: string }
      ) {
        const opts = getGlobalOpts(this);
        const vaultKey = await resolveVaultKey(cmdOpts.vaultKey);
        const unlocked = await createClient(opts).vault.unlock(vaultKey);
        const existing = unlocked.getSecret(secretId);

        const touchesPayload = PAYLOAD_FLAG_KEYS.some((f) => cmdOpts[f] !== undefined);
        const payload = touchesPayload ? await applyUpdates(existing.type, existing.payload, cmdOpts) : undefined;

        const updated = await unlocked.updateSecret(secretId, {
          name: cmdOpts.name,
          description: cmdOpts.description,
          payload,
        });
        if (opts.json) output({ id: updated.id, name: updated.name }, { json: true });
        else console.log(`Updated secret '${updated.name}' (${updated.id}).`);
      })
    );

  vault
    .command("rm <name-or-id>")
    .description("Delete a secret permanently (by name or id)")
    .action(
      withErrorHandler(async function (this: Command, nameOrId: string) {
        const opts = getGlobalOpts(this);
        const client = createClient(opts);
        const id = await resolveSecretId(client, nameOrId);
        await client.vault.deleteSecret(id);
        if (opts.json) output({ deleted: id }, { json: true });
        else console.log(`Deleted secret '${nameOrId}'.`);
      })
    );

  vault
    .command("totp <name-or-id>")
    .description("Print the current TOTP code for a login secret")
    .option("--vault-key <key>", "Vault key (or set WIREBOX_VAULT_KEY)")
    .action(
      withErrorHandler(async function (this: Command, secretId: string, cmdOpts: { vaultKey?: string }) {
        const opts = getGlobalOpts(this);
        const vaultKey = await resolveVaultKey(cmdOpts.vaultKey);
        const unlocked = await createClient(opts).vault.unlock(vaultKey);
        const code = await unlocked.getTotpCode(secretId);
        if (opts.json) output(code as unknown as Record<string, unknown>, { json: true });
        else console.log(`${code.code}  (expires in ${code.expiresInSeconds}s)`);
      })
    );

  const access = vault.command("access").description("Manage per-secret identity access grants");

  access
    .command("grant <name-or-id>")
    .description("Grant an agent identity access to a secret")
    .requiredOption("-i, --identity <handle-or-id>", "Agent identity handle (@eva) or id (agt_...)")
    .action(
      withErrorHandler(async function (this: Command, nameOrId: string, cmdOpts: { identity: string }) {
        const opts = getGlobalOpts(this);
        const client = createClient(opts);
        const [secretId, identityId] = await Promise.all([
          resolveSecretId(client, nameOrId),
          resolveIdentityId(client, cmdOpts.identity),
        ]);
        const grant = await client.vault.grantAccess(secretId, identityId);
        if (opts.json) output(grant as unknown as Record<string, unknown>, { json: true });
        else console.log(`Granted '${cmdOpts.identity}' access to secret '${nameOrId}'.`);
      })
    );

  access
    .command("revoke <name-or-id>")
    .description("Revoke an agent identity's access to a secret")
    .requiredOption("-i, --identity <handle-or-id>", "Agent identity handle (@eva) or id (agt_...)")
    .action(
      withErrorHandler(async function (this: Command, nameOrId: string, cmdOpts: { identity: string }) {
        const opts = getGlobalOpts(this);
        const client = createClient(opts);
        const [secretId, identityId] = await Promise.all([
          resolveSecretId(client, nameOrId),
          resolveIdentityId(client, cmdOpts.identity),
        ]);
        await client.vault.revokeAccess(secretId, identityId);
        if (opts.json) output({ revoked: cmdOpts.identity, secret_id: secretId }, { json: true });
        else console.log(`Revoked '${cmdOpts.identity}' access to secret '${nameOrId}'.`);
      })
    );

  access
    .command("list <name-or-id>")
    .description("List identities granted access to a secret")
    .action(
      withErrorHandler(async function (this: Command, nameOrId: string) {
        const opts = getGlobalOpts(this);
        const client = createClient(opts);
        const secretId = await resolveSecretId(client, nameOrId);
        const grants = await client.vault.listAccess(secretId);
        output(grants as unknown as Record<string, unknown>[], { json: !!opts.json, columns: ACCESS_COLUMNS });
      })
    );
}
