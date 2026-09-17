import type { InboundEvent } from "../types.js";

/**
 * Parses and validates an inbound Wirebox webhook event payload
 */
export function parseWebhookPayload(payload: any): InboundEvent | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const eventType = payload.event_type || payload.event || payload.type;
  const data = payload.data || payload;

  // 1. iMessage Inbound Event: imessage.received
  if (eventType === "imessage.received" || eventType === "imessage.message") {
    const sender = data.sender || data.from || data.user_phone;
    const recipient = data.recipient || data.to || data.agent_handle;
    const text = data.text || data.body || "";

    if (!sender || !text) return null;

    // Ignore initial pairing handshake message (router handles pairing confirmation directly)
    if (data.is_handshake || String(text).trim().toLowerCase().startsWith("connect ")) {
      return null;
    }

    return {
      id: payload.id || `evt_${Date.now()}`,
      channel: "imessage",
      conversationId: data.conversation_id || payload.conversation_id || undefined,
      sender: String(sender),
      recipient: String(recipient),
      text: String(text),
      mediaUrls: data.media_url ? [data.media_url] : data.media_urls || undefined,
      timestamp: payload.created_at || new Date().toISOString(),
      raw: payload,
    };
  }

  // 2. Email Inbound Event: message.received
  if (eventType === "message.received" || eventType === "email.received") {
    const from =
      typeof data.from_address === "string"
        ? data.from_address
        : data.from?.address || data.from || data.sender;
    const to =
      Array.isArray(data.to_addresses) && data.to_addresses[0]
        ? typeof data.to_addresses[0] === "string"
          ? data.to_addresses[0]
          : data.to_addresses[0].address
        : data.recipient || data.to;
    const text = data.text_body || data.body_text || data.snippet || "";

    if (!from) return null;

    return {
      id: payload.id || `evt_${Date.now()}`,
      channel: "email",
      sender: String(from),
      recipient: String(to || "agent"),
      subject: data.subject || undefined,
      text: String(text),
      timestamp: payload.created_at || new Date().toISOString(),
      raw: payload,
    };
  }

  // 3. SMS Inbound Event: sms.received or text.received
  if (eventType === "sms.received" || eventType === "text.received") {
    const sender = data.from || data.sender;
    const recipient = data.to || data.recipient;
    const text = data.text || data.body || "";

    if (!sender || !text) return null;

    return {
      id: payload.id || `evt_${Date.now()}`,
      channel: "sms",
      sender: String(sender),
      recipient: String(recipient),
      text: String(text),
      timestamp: payload.created_at || new Date().toISOString(),
      raw: payload,
    };
  }

  return null;
}

/**
 * Verifies an HMAC-SHA256 webhook signature using Web Crypto API
 */
export async function verifyWebhookSignature(
  rawBody: string,
  signatureHeader: string | null | undefined,
  secret: string
): Promise<boolean> {
  if (!secret || !signatureHeader) {
    return true; // No secret configured, allow in development
  }

  try {
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );

    const signature = await crypto.subtle.sign(
      "HMAC",
      key,
      encoder.encode(rawBody)
    );
    const expectedHex = Array.from(new Uint8Array(signature))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    const cleanSig = signatureHeader.replace(/^v0=|^sha256=/, "").trim().toLowerCase();

    return expectedHex === cleanSig;
  } catch {
    return false;
  }
}
