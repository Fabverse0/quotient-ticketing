import type { InvariantReport } from "./service.js";

const OK = "[OK]     ";
const VIOLATED = "[LANGGAR]";
const INDENT = " ".repeat(VIOLATED.length + 1);

const pairs = (values: Record<string, number | string>, separator: string) =>
  Object.entries(values)
    .map(([key, value]) => `${key}=${value}`)
    .join(separator);

export function formatReport(report: InvariantReport): string {
  const violated = report.checks.filter((c) => !c.ok).length;
  const lines = [
    report.ok
      ? `Hasil: OK (${report.checks.length} pemeriksaan)`
      : `Hasil: LANGGAR (${violated} dari ${report.checks.length} pemeriksaan dilanggar)`,
    "",
  ];
  // Totals add up every row; each violation line shows its own row's numbers.
  for (const check of report.checks) {
    lines.push(`${check.ok ? OK : VIOLATED} ${check.description} (${check.checked} diperiksa, total: ${pairs(check.values, ", ")})`);
    for (const violation of check.violations) {
      lines.push(`${INDENT}${pairs(violation.subject, " ")}: ${pairs(violation.values, ", ")}`);
    }
  }
  lines.push("");
  return lines.join("\n");
}
