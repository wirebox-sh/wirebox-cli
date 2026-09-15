import { describe, it, expect, vi } from "vitest";
import { output, printJson, printRecord, printTable } from "../src/output.js";

describe("CLI Output Formatter", () => {
  it("printJson prints formatted JSON string", () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    printJson({ key: "value", count: 42 });

    expect(logSpy).toHaveBeenCalledWith(
      JSON.stringify({ key: "value", count: 42 }, null, 2)
    );
    logSpy.mockRestore();
  });

  it("printRecord prints key-value formatted lines", () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    printRecord({ Name: "Eva", Status: "active" });

    expect(logSpy).toHaveBeenCalled();
    logSpy.mockRestore();
  });

  it("printTable prints ASCII table with column headers", () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    printTable(
      [
        { handle: "bot1", status: "active" },
        { handle: "bot2", status: "archived" },
      ],
      ["handle", "status"]
    );

    expect(logSpy).toHaveBeenCalled();
    logSpy.mockRestore();
  });

  it("output delegates to JSON when json: true", () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    output({ test: true }, { json: true });

    expect(logSpy).toHaveBeenCalledWith(
      JSON.stringify({ test: true }, null, 2)
    );
    logSpy.mockRestore();
  });
});
