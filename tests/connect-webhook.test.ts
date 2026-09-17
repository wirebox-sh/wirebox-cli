import { describe, expect, it } from "vitest";
import { createHmac } from "node:crypto";
import {
  parseWebhookPayload,
  verifyWebhookSignature,
} from "../src/connect/core/webhook.js";

describe("Webhook Parser & Verifier", () => {
  const secret = "whsec_test_secret_123456789";

  it("verifies valid HMAC-SHA256 signature", async () => {
    const body = JSON.stringify({ event: "ping", time: Date.now() });
    const signature = createHmac("sha256", secret).update(body).digest("hex");

    expect(await verifyWebhookSignature(body, signature, secret)).toBe(true);
    expect(await verifyWebhookSignature(body, `sha256=${signature}`, secret)).toBe(true);
  });

  it("rejects invalid HMAC-SHA256 signature", async () => {
    const body = JSON.stringify({ event: "ping" });
    const wrongSig = createHmac("sha256", "different_secret").update(body).digest("hex");

    expect(await verifyWebhookSignature(body, wrongSig, secret)).toBe(false);
  });

  it("parses imessage.received webhook payload", () => {
    const payload = {
      event: "imessage.received",
      data: {
        id: "msg_imsg_101",
        sender: "+14155552671",
        recipient: "agent-handle",
        text: "Fix the build failure",
        media_urls: ["https://example.com/screenshot.png"],
        timestamp: "2026-09-17T12:00:00Z",
      },
    };

    const parsed = parseWebhookPayload(payload);
    expect(parsed).toBeDefined();
    expect(parsed?.channel).toBe("imessage");
    expect(parsed?.sender).toBe("+14155552671");
    expect(parsed?.text).toBe("Fix the build failure");
    expect(parsed?.mediaUrls).toEqual(["https://example.com/screenshot.png"]);
  });

  it("parses email message.received webhook payload", () => {
    const payload = {
      event: "message.received",
      data: {
        id: "msg_email_202",
        from: "developer@example.com",
        to: "bot@wirebox.sh",
        subject: "Deploy to staging",
        text: "Please trigger staging deployment",
        body_text: "Please trigger staging deployment",
        created_at: "2026-09-17T12:05:00Z",
      },
    };

    const parsed = parseWebhookPayload(payload);
    expect(parsed).toBeDefined();
    expect(parsed?.channel).toBe("email");
    expect(parsed?.sender).toBe("developer@example.com");
    expect(parsed?.subject).toBe("Deploy to staging");
    expect(parsed?.text).toBe("Please trigger staging deployment");
  });
});
