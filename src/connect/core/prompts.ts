import type { InboundChannel, InboundEvent } from "../types.js";

/**
 * Builds dynamic system prompt augmentations based on communication modality
 */
export function buildChannelPrompt(channel: InboundChannel): string {
  if (channel === "imessage" || channel === "sms") {
    return (
      "You are communicating with the user directly over their mobile phone via " +
      (channel === "imessage" ? "Apple iMessage." : "SMS.") +
      "\n- Format: Plain text, concise and readable on a small screen." +
      "\n- Style: Get straight to the point. State conclusions and actions first." +
      "\n- Length: Aim for 1-3 short paragraphs max unless explicitly requested." +
      "\n- Formatting: Do NOT use markdown tables or complex ASCII art. Minimize bullet lists."
    );
  }

  return (
    "You are communicating with the user via Email." +
    "\n- Format: Clean markdown with structured headers and code blocks is welcome." +
    "\n- Style: Comprehensive, structured, and professional."
  );
}

/**
 * Formats incoming event context for the agent's turn
 */
export function frameInboundMessage(event: InboundEvent): string {
  const header = `[Inbound via ${event.channel.toUpperCase()} from ${event.sender}${
    event.subject ? ` | Subject: "${event.subject}"` : ""
  }]`;

  return `${header}\n\n${event.text}`;
}

/**
 * Strips rich Markdown formatting for mobile phone bubble display
 */
export function stripMarkdown(markdown: string): string {
  if (!markdown) return "";

  let text = markdown;

  // Remove bold / italic markers (***, **, *, ___, __, _)
  text = text.replace(/\*\*\*(.*?)\*\*\*/g, "$1");
  text = text.replace(/\*\*(.*?)\*\*/g, "$1");
  text = text.replace(/\*(.*?)\*/g, "$1");
  text = text.replace(/___(.*?)___/g, "$1");
  text = text.replace(/__(.*?)__/g, "$1");
  text = text.replace(/_(.*?)_/g, "$1");

  // Remove headers (#, ##, ###)
  text = text.replace(/^#{1,6}\s+(.*?)$/gm, "$1");

  // Transform markdown links [text](url) -> text (url)
  text = text.replace(/\[(.*?)\]\((https?:\/\/.*?)\)/g, "$1: $2");

  // Simplify inline code `foo` -> foo
  text = text.replace(/`([^`]+)`/g, "$1");

  // Simplify code blocks ```ts\ncode\n``` -> \ncode\n
  text = text.replace(/```[a-zA-Z0-9_-]*\n([\s\S]*?)\n```/g, "$1");

  // Remove blockquotes > quote -> quote
  text = text.replace(/^>\s+/gm, "");

  // Normalize multiple consecutive blank lines to double newlines
  text = text.replace(/\n{3,}/g, "\n\n");

  return text.trim();
}
