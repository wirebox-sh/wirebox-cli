/**
 * Wirebox CLI - Output Formatter
 *
 * Supports human-friendly ASCII tables/records and raw JSON output for Agent scripts.
 */

function formatValue(v: unknown): string {
  if (v === null || v === undefined) return "-";
  if (typeof v === "boolean") return v ? "true" : "false";
  if (v instanceof Date) return v.toISOString().slice(0, 19).replace("T", " ");
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

export function printTable(
  rows: Record<string, unknown>[],
  columns?: string[]
): void {
  if (rows.length === 0) {
    console.log("No results found.");
    return;
  }

  const effectiveColumns =
    columns && columns.length > 0
      ? columns
      : Array.from(new Set(rows.flatMap((r) => Object.keys(r))));

  const widths = effectiveColumns.map((col) =>
    Math.max(col.length, ...rows.map((r) => formatValue(r[col]).length))
  );

  const header = effectiveColumns
    .map((col, i) => col.toUpperCase().padEnd(widths[i] ?? 0))
    .join("  ");
  const separator = widths.map((w) => "-".repeat(w)).join("  ");

  console.log(header);
  console.log(separator);
  for (const row of rows) {
    const line = effectiveColumns
      .map((col, i) => formatValue(row[col]).padEnd(widths[i] ?? 0))
      .join("  ");
    console.log(line);
  }
}

export function printRecord(obj: Record<string, unknown>): void {
  const keys = Object.keys(obj);
  if (keys.length === 0) {
    console.log("{}");
    return;
  }

  const maxKey = Math.max(...keys.map((k) => k.length));
  for (const [key, val] of Object.entries(obj)) {
    console.log(`${key.padEnd(maxKey)}  : ${formatValue(val)}`);
  }
}

export function printJson(data: unknown): void {
  console.log(JSON.stringify(data, null, 2));
}

export function output(
  data: unknown,
  opts?: { json?: boolean; columns?: string[] }
): void {
  if (opts?.json) {
    printJson(data);
    return;
  }

  if (Array.isArray(data)) {
    printTable(data as Record<string, unknown>[], opts?.columns);
  } else if (typeof data === "object" && data !== null) {
    printRecord(data as Record<string, unknown>);
  } else {
    console.log(data);
  }
}
