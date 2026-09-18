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

  // 2. Email Inbound Event: email.received
  if (eventType === "email.received") {
    const msg = data.message || data;
    const from =
      typeof msg.from_address === "string"
        ? msg.from_address
        : msg.from?.address || msg.from || msg.sender;
    const to =
      Array.isArray(msg.to_addresses) && msg.to_addresses[0]
        ? typeof msg.to_addresses[0] === "string"
          ? msg.to_addresses[0]
          : msg.to_addresses[0].address
        : Array.isArray(msg.to) && msg.to[0]
          ? msg.to[0]
          : msg.recipient || msg.to;
    const text = msg.text_body || msg.body_text || msg.snippet || msg.text || "";

    if (!from) return null;

    return {
      id: payload.id || `evt_${Date.now()}`,
      channel: "email",
      sender: String(from),
      recipient: String(to || "agent"),
      subject: msg.subject || undefined,
      text: String(text),
      timestamp: payload.created_at || new Date().toISOString(),
      raw: payload,
    };
  }

  // 3. SMS Inbound Event: sms.received
  if (eventType === "sms.received" || eventType === "text.received") {
    const msg = data.message || data;
    const sender = msg.from_number || msg.from || msg.sender;
    const recipient =
      (Array.isArray(msg.to_numbers) ? msg.to_numbers[0] : null) ||
      msg.phone_number ||
      msg.to ||
      msg.recipient;
    const text = msg.text || msg.body || "";

    if (!sender || !text) return null;

    return {
      id: payload.id || `evt_${Date.now()}`,
      channel: "sms",
      sender: String(sender),
      recipient: String(recipient || "agent"),
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
