import { describe, it, expect, vi } from "vitest";
import { AuthenticationError, HandleAlreadyTakenError } from "@wirebox-sh/sdk";
import { withErrorHandler } from "../src/errors.js";

describe("CLI withErrorHandler", () => {
  it("catches AuthenticationError and prints hint", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const exitSpy = vi.spyOn(process, "exit").mockImplementation((() => {}) as any);

    const failingAction = withErrorHandler(async () => {
      throw new AuthenticationError(401, "unauthorized", "Invalid API key");
    });

    await failingAction();

    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("Error: HTTP 401 [unauthorized]: Invalid API key")
    );
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("Hint: Set WIREBOX_API_KEY")
    );
    expect(exitSpy).toHaveBeenCalledWith(1);

    errorSpy.mockRestore();
    exitSpy.mockRestore();
  });

  it("catches HandleAlreadyTakenError and prints hint", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const exitSpy = vi.spyOn(process, "exit").mockImplementation((() => {}) as any);

    const failingAction = withErrorHandler(async () => {
      throw new HandleAlreadyTakenError(409, "handle_already_taken", "Handle taken");
    });

    await failingAction();

    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("Choose a different handle")
    );
    expect(exitSpy).toHaveBeenCalledWith(1);

    errorSpy.mockRestore();
    exitSpy.mockRestore();
  });
});
