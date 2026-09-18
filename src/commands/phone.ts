/**
 * Wirebox CLI - Phone & SMS Communication Commands
 */

import { Command } from "commander";
import { createClient, getGlobalOpts } from "../client.js";
import { withErrorHandler } from "../errors.js";
import { output } from "../output.js";

const NUMBER_COLUMNS = [
  "phone_number",
  "id",
  "type",
  "region",
  "agent_handle",
  "status",
  "sms_status",
  "created_at",
];

const MESSAGE_COLUMNS = [
  "id",
  "direction",
  "type",
  "from_number",
  "text",
  "is_read",
  "created_at",
];

export function registerPhoneCommands(program: Command): void {
  const phone = program
    .command("phone")
    .description("Cellular phone numbers and SMS/MMS communication for AI agents");

  // 1. wirebox phone provision
  phone
    .command("provision")
    .description("Provision a new carrier phone number and bind it to an agent identity")
    .requiredOption("--agent <handle>", "Agent handle to bind this number to (e.g. @support-bot)")
    .option("--region <region>", "Two-letter US state or CA province code (e.g. CA, NY)")
    .option("--area-code <code>", "Three-digit telephone area code (e.g. 415, 212)")
    .option("--type <type>", "Number type: local or toll_free (default: local)", "local")
    .option("--country <country>", "Country code: US or CA (default: US)", "US")
    .action(
      withErrorHandler(async function (
        this: Command,
        cmdOpts: {
          agent: string;
          region?: string;
          areaCode?: string;
          type?: string;
          country?: string;
        }
      ) {
        const opts = getGlobalOpts(this);
        const client = createClient(opts);

        if (cmdOpts.region && cmdOpts.areaCode) {
          throw new Error("--region and --area-code are mutually exclusive.");
        }

        const number = await client.phone.numbers.provision({
          agent_handle: cmdOpts.agent,
          region: cmdOpts.region,
          area_code: cmdOpts.areaCode,
          type: cmdOpts.type as "local" | "toll_free",
          country_code: cmdOpts.country as "US" | "CA",
        });

        if (opts.json) {
          output(number, { json: true });
          return;
        }

        console.log(`✓ Provisioned phone number: ${number.phone_number}`);
        output(number as unknown as Record<string, unknown>);
      })
    );

  // 2. wirebox phone list
  phone
    .command("list")
    .description("List active phone numbers in your organization")
    .option("--status <status>", "Filter by number status: active or released")
    .option("--sms-status <status>", "Filter by SMS status: ready, pending, or assignment_failed")
    .option("--limit <n>", "Maximum number of numbers to return", (v) => parseInt(v, 10))
    .option("--cursor <cursor>", "Opaque pagination cursor")
    .action(
      withErrorHandler(async function (
        this: Command,
        cmdOpts: {
          status?: string;
          smsStatus?: string;
          limit?: number;
          cursor?: string;
        }
      ) {
        const opts = getGlobalOpts(this);
        const client = createClient(opts);

        const res = await client.phone.numbers.list({
          status: cmdOpts.status,
          sms_status: cmdOpts.smsStatus,
          limit: cmdOpts.limit,
          cursor: cmdOpts.cursor,
        });

        if (opts.json) {
          output(res, { json: true });
          return;
        }

        output(res.numbers as unknown as Record<string, unknown>[], {
          columns: NUMBER_COLUMNS,
        });
        if (res.has_more && res.next_cursor) {
          console.log(`\nNext cursor: ${res.next_cursor}`);
        }
      })
    );

  // 3. wirebox phone get <target>
  phone
    .command("get <target>")
    .description("Get phone number details by pn_... ID, E.164 number, or agent handle")
    .action(
      withErrorHandler(async function (this: Command, target: string) {
        const opts = getGlobalOpts(this);
        const client = createClient(opts);

        const number = await client.phone.numbers.get(target);
        output(number as unknown as Record<string, unknown>, { json: !!opts.json });
      })
    );

  // 4. wirebox phone release <target>
  phone
    .command("release <target>")
    .description("Release a phone number back to the carrier")
    .option("-y, --yes", "Skip confirmation prompt", false)
    .action(
      withErrorHandler(async function (
        this: Command,
        target: string
      ) {
        const opts = getGlobalOpts(this);
        const client = createClient(opts);

        await client.phone.numbers.release(target);
        if (opts.json) {
          output({ status: "released", target }, { json: true });
        } else {
          console.log(`✓ Released phone number '${target}'.`);
        }
      })
    );

  // 5. wirebox phone messages <target>
  phone
    .command("messages <target>")
    .description("List received SMS/MMS messages for a phone number or agent")
    .option("--unread-only", "Show only unread messages", false)
    .option("--from <number>", "Filter by sender phone number")
    .option("--limit <n>", "Maximum number of messages to return", (v) => parseInt(v, 10))
    .option("--cursor <cursor>", "Opaque pagination cursor")
    .action(
      withErrorHandler(async function (
        this: Command,
        target: string,
        cmdOpts: {
          unreadOnly?: boolean;
          from?: string;
          limit?: number;
          cursor?: string;
        }
      ) {
        const opts = getGlobalOpts(this);
        const client = createClient(opts);

        const res = await client.phone.messages.list(target, {
          is_read: cmdOpts.unreadOnly ? false : undefined,
          from_number: cmdOpts.from,
          limit: cmdOpts.limit,
          cursor: cmdOpts.cursor,
        });

        if (opts.json) {
          output(res, { json: true });
          return;
        }

        output(res.messages as unknown as Record<string, unknown>[], {
          columns: MESSAGE_COLUMNS,
        });
        if (res.has_more && res.next_cursor) {
          console.log(`\nNext cursor: ${res.next_cursor}`);
        }
      })
    );

  // 6. wirebox phone message <target> <message-id>
  phone
    .command("message <target> <message-id>")
    .description("Get details and signed media URLs of an SMS/MMS message")
    .action(
      withErrorHandler(async function (
        this: Command,
        target: string,
        messageId: string
      ) {
        const opts = getGlobalOpts(this);
        const client = createClient(opts);

        const msg = await client.phone.messages.get(target, messageId);

        if (opts.json) {
          output(msg, { json: true });
          return;
        }

        console.log("------------------------------------------------------------");
        console.log(`Message ID   : ${msg.id}`);
        console.log(`Direction    : ${msg.direction}`);
        console.log(`Type         : ${msg.type.toUpperCase()}`);
        console.log(`From         : ${msg.from_number}`);
        console.log(`To           : ${msg.to_numbers.join(", ")}`);
        console.log(`Read Status  : ${msg.is_read ? "read" : "unread"}`);
        console.log(`Received At  : ${msg.created_at}`);
        console.log("------------------------------------------------------------");
        console.log(`Text:\n${msg.text || "(empty)"}`);

        if (msg.media && msg.media.length > 0) {
          console.log("\nAttachments (MMS):");
          for (const [idx, item] of msg.media.entries()) {
            console.log(` [${idx + 1}] ${item.content_type} (${item.size_bytes} bytes)`);
            if (item.url) {
              console.log(`     Download URL: ${item.url}`);
            }
          }
        }
        console.log("------------------------------------------------------------");
      })
    );

  // 7. wirebox phone mark-read <target> <message-id>
  phone
    .command("mark-read <target> <message-id>")
    .description("Mark an SMS/MMS message as read")
    .action(
      withErrorHandler(async function (
        this: Command,
        target: string,
        messageId: string
      ) {
        const opts = getGlobalOpts(this);
        const client = createClient(opts);

        const updated = await client.phone.messages.markRead(target, messageId);

        if (opts.json) {
          output(updated, { json: true });
        } else {
          console.log(`✓ Marked message '${messageId}' as read.`);
        }
      })
    );
}
