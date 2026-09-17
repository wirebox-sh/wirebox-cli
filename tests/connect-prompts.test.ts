import { describe, expect, it } from "vitest";
import {
  buildChannelPrompt,
  frameInboundMessage,
  stripMarkdown,
} from "../src/connect/core/prompts.js";
import type { InboundEvent } from "../src/connect/types.js";

describe("Prompts & Mobile Text Sanitizer", () => {
  describe("stripMarkdown", () => {
    it("strips bold, italic, and headers", () => {
      const input = "### Status Update\nThis is **bold** and *italic* text.";
      const stripped = stripMarkdown(input);
      expect(stripped).not.toContain("###");
      expect(stripped).not.toContain("**");
      expect(stripped).not.toContain("*italic*");
      expect(stripped).toContain("Status Update");
      expect(stripped).toContain("bold and italic text.");
    });

    it("converts markdown links to text: url", () => {
      const input = "Check our docs at [Wirebox](https://wirebox.sh).";
      const stripped = stripMarkdown(input);
      expect(stripped).toBe("Check our docs at Wirebox: https://wirebox.sh.");
    });

    it("preserves inline code as plain text", () => {
      const input = "Run `npm run build` now.";
      const stripped = stripMarkdown(input);
      expect(stripped).toBe("Run npm run build now.");
    });
  });

  describe("buildChannelPrompt", () => {
    it("includes mobile conciseness constraints for iMessage", () => {
      const prompt = buildChannelPrompt("imessage");
      expect(prompt).toContain("Apple iMessage");
      expect(prompt).toContain("Plain text, concise and readable on a small screen");
      expect(prompt).toContain("State conclusions and actions first");
    });

    it("allows markdown for email channel", () => {
      const prompt = buildChannelPrompt("email");
      expect(prompt).toContain("Email");
      expect(prompt).toContain("Clean markdown with structured headers");
    });
  });

  describe("frameInboundMessage", () => {
    it("frames inbound event with sender and subject metadata", () => {
      const event: InboundEvent = {
        id: "evt_123",
        channel: "email",
        sender: "alice@example.com",
        recipient: "bot@wirebox.sh",
        subject: "Bug in auth",
        text: "Please look at the oauth callback error.",
        timestamp: new Date().toISOString(),
      };

      const framed = frameInboundMessage(event);
      expect(framed).toContain("Inbound via EMAIL from alice@example.com");
      expect(framed).toContain('Subject: "Bug in auth"');
      expect(framed).toContain("Please look at the oauth callback error.");
    });
  });
});
