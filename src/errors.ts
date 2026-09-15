/**
 * Wirebox CLI - Error Handler
 */

import {
  AuthenticationError,
  FreeTierLimitExceededError,
  HandleAlreadyTakenError,
  RateLimitError,
  WireboxAPIError,
  WireboxConnectionError,
  WireboxError,
} from "@wirebox-sh/sdk";
import type { Command } from "commander";
import { getGlobalOpts } from "./client.js";

function wantsJson(cmd: unknown): boolean {
  if (!cmd || typeof (cmd as Command).opts !== "function") return false;
  return !!getGlobalOpts(cmd as Command).json;
}

function renderJsonError(err: unknown): void {
  if (err instanceof WireboxAPIError) {
    console.error(
      JSON.stringify(
        {
          error: {
            type: err.name,
            code: err.code,
            status: err.status,
            message: err.message,
            requestId: err.requestId,
          },
        },
        null,
        2
      )
    );
    return;
  }

  if (err instanceof Error) {
    console.error(
      JSON.stringify(
        {
          error: {
            type: err.name,
            message: err.message,
          },
        },
        null,
        2
      )
    );
    return;
  }

  console.error(
    JSON.stringify(
      {
        error: {
          type: "UnknownError",
          message: String(err),
        },
      },
      null,
      2
    )
  );
}

export function withErrorHandler<T extends unknown[]>(
  fn: (...args: T) => Promise<void>
): (...args: T) => Promise<void> {
  return async function (this: unknown, ...args: T) {
    try {
      await fn.call(this, ...args);
    } catch (err) {
      if (wantsJson(this)) {
        renderJsonError(err);
      } else if (err instanceof AuthenticationError) {
        console.error(`Error: HTTP ${err.status} [${err.code}]: ${err.message}`);
        console.error("Hint: Set WIREBOX_API_KEY, pass --api-key, or run 'wirebox signup'.");
      } else if (err instanceof HandleAlreadyTakenError) {
        console.error(`Error: HTTP ${err.status} [${err.code}]: ${err.message}`);
        console.error("Hint: Choose a different handle for your agent identity.");
      } else if (err instanceof FreeTierLimitExceededError) {
        console.error(`Error: HTTP ${err.status} [${err.code}]: ${err.message}`);
        console.error("Hint: Free tier limit of 3 agents reached. Visit https://wirebox.sh/console to manage agents.");
      } else if (err instanceof RateLimitError) {
        console.error(`Error: HTTP ${err.status} [${err.code}]: ${err.message}`);
        if (err.retryAfterSeconds) {
          console.error(`Hint: Please retry after ${err.retryAfterSeconds} seconds.`);
        }
      } else if (err instanceof WireboxAPIError) {
        console.error(`Error: HTTP ${err.status} [${err.code}]: ${err.message}`);
      } else if (err instanceof WireboxConnectionError) {
        console.error(`Connection Error: ${err.message}`);
        console.error("Hint: Verify network connection and base URL.");
      } else if (err instanceof WireboxError || err instanceof Error) {
        console.error(`Error: ${err.message}`);
      } else {
        console.error(`Unexpected error: ${String(err)}`);
      }

      process.exit(1);
    }
  };
}
