import Papa from "papaparse";
import Decimal from "decimal.js";
import { date, iso, monthsBetween } from "./dates";
import type { BaselineRow, Scenario } from "./model";
import { expandedTransactions, type Projection } from "./engine";

export interface ImportData {
  headers: string[];
  rows: string[][];
}

export function csvCell(value: unknown): string {
  const text = String(value ?? "");
  return /^\s*[=+@]/.test(text) ||
    /^[\t\r]/.test(text) ||
    (/^\s*-/.test(text) && !/^-?\d+(\.\d+)?$/.test(text))
    ? `'${text}`
    : text;
}

export function makeCsv(headers: string[], rows: unknown[][]): string {
  return (
    "\uFEFF" +
    Papa.unparse({ fields: headers.map(csvCell), data: rows.map((row) => row.map(csvCell)) })
  );
}

export function parseCsv(text: string): ImportData {
  const result = Papa.parse<string[]>(text.replace(/^\uFEFF/, ""), { skipEmptyLines: "greedy" });
  if (result.errors.length) throw new Error(result.errors[0].message);
  const [headers, ...rows] = result.data;
  if (!headers?.length || !rows.length)
    throw new Error("The file must contain headers and at least one data row.");
  if (new Set(headers).size !== headers.length || headers.some((header) => !header.trim()))
    throw new Error("Column headings must be non-empty and unique.");
  if (rows.length > 600) throw new Error("Import at most 600 monthly rows.");
  if (rows.some((row) => row.length !== headers.length))
    throw new Error("Rows must have the same number of columns as the header.");
  return { headers, rows };
}

export async function readFile(file: File): Promise<ImportData> {
  if (file.size > 10 * 1024 * 1024) throw new Error("Import files must be at most 10 MB.");
  if (/\.xlsx$/i.test(file.name)) {
    const { readSheet } = await import("read-excel-file/browser");
    const cells = await readSheet(file, 1);
    const rows = cells.map((row) =>
      row.map((cell) => (cell instanceof Date ? iso(cell).slice(0, 7) : String(cell ?? ""))),
    );
    return parseCsv(Papa.unparse(rows));
  }
  if (!/\.csv$/i.test(file.name)) throw new Error("Choose a CSV or XLSX file.");
  return parseCsv(await file.text());
}

export function parseMonth(value: string): string | null {
  const text = value.trim();
  if (/^\d{4}-(0[1-9]|1[0-2])(?:-01)?$/.test(text)) return text.slice(0, 7);
  const match = /^([A-Za-z]{3,9})\s+(\d{4})$/.exec(text);
  if (!match) return null;
  const index = [
    "jan",
    "feb",
    "mar",
    "apr",
    "may",
    "jun",
    "jul",
    "aug",
    "sep",
    "oct",
    "nov",
    "dec",
  ].indexOf(match[1].slice(0, 3).toLowerCase());
  return index < 0 ? null : `${match[2]}-${String(index + 1).padStart(2, "0")}`;
}

export function parseNumber(value: string): string | null {
  const clean = value.trim();
  return /^-?(?:\d+|\d{1,3}(?:,\d{3})+)(\.\d+)?$/.test(clean) ? clean.replace(/,/g, "") : null;
}

export interface BaselinePreview {
  rows: BaselineRow[];
  errors: string[];
  warnings: string[];
}

export function previewBaseline(
  data: ImportData,
  mapping: Record<string, string>,
): BaselinePreview {
  const errors: string[] = [],
    warnings: string[] = [],
    rows: BaselineRow[] = [];
  const monthColumns = data.headers.filter((header) => mapping[header] === "month");
  if (monthColumns.length !== 1)
    return { rows, errors: ["Map exactly one column to Month."], warnings };
  const seen = new Set<string>();
  const mappedRoles = Object.values(mapping).filter(
    (role) => role !== "ignore" && role !== "reference",
  );
  if (new Set(mappedRoles).size !== mappedRoles.length)
    errors.push("Map each accounting role or account-interest column at most once.");
  for (const [index, cells] of data.rows.entries()) {
    const values = Object.fromEntries(
      data.headers.map((header, column) => [header, cells[column] ?? ""]),
    );
    const month = parseMonth(values[monthColumns[0]]);
    if (!month || Number(month.slice(0, 4)) < 1900 || Number(month.slice(0, 4)) > 2200) {
      errors.push(`Row ${index + 2}: unrecognized month.`);
      continue;
    }
    if (seen.has(month)) errors.push(`Duplicate month ${month}.`);
    seen.add(month);
    for (const header of data.headers) {
      const role = mapping[header] ?? "ignore";
      if (["month", "ignore", "reference"].includes(role)) continue;
      const number = parseNumber(values[header]);
      if (number === null) errors.push(`${month}: ${header} is not a valid number.`);
      else if (role === "balance" && new Decimal(number).isNegative())
        errors.push(`${month}: negative balance.`);
    }
    const interestColumns = data.headers.filter((header) =>
      mapping[header]?.startsWith("account:"),
    );
    const totalColumn = data.headers.find((header) => mapping[header] === "interest");
    if (interestColumns.length && totalColumn) {
      const numbers = interestColumns.map((header) => parseNumber(values[header]));
      const total = parseNumber(values[totalColumn]);
      if (total && numbers.every((number) => number !== null)) {
        const sum = numbers.reduce((result, number) => result.plus(number!), new Decimal(0));
        if (sum.minus(total).abs().gt("0.01"))
          warnings.push(
            `${month}: mapped account interest differs from Total Interest; original figures preserved.`,
          );
      }
    }
    rows.push({ month, values, mapping: { ...mapping } });
  }
  const sorted = [...seen].sort();
  for (let index = 1; index < sorted.length; index++)
    if (monthsBetween(sorted[index - 1], sorted[index]) > 1)
      warnings.push(`Missing months between ${sorted[index - 1]} and ${sorted[index]}.`);
  if (data.headers.some((header) => !mapping[header] || mapping[header] === "ignore"))
    warnings.push(
      "Unmapped columns are preserved as source values but have no accounting interpretation.",
    );
  warnings.push(
    "Baseline only: opening capital, net rates, tax conventions, timing, and the meaning of transfer labels must be configured separately.",
  );
  return { rows: rows.sort((a, b) => a.month.localeCompare(b.month)), errors, warnings };
}

export const SAMPLE_BASELINE = `Month,A Int,B Int,C Int,D Int,E Int,IFB → A D,Deposit,Total Interest,Total Balance
Aug 2026,1525,39204,3418,27303,74,20286,300000,91810,9098143
Sep 2026,2613,39501,3442,36304,75,20286,600000,102221,9806364
Oct 2026,3708,39800,3467,38567,75,20286,300000,105903,10215267
Nov 2026,4810,40102,3492,38874,76,20286,300000,107640,10626907
Dec 2026,5920,40406,3517,47392,77,20286,750000,117598,11494505`;

export function projectionCsv(projection: Projection): string {
  return makeCsv(
    [
      "Month",
      "Opening balance",
      "Opening capital introduced",
      "External contributions",
      "Net interest earned",
      "Net interest credited",
      "Reinvested interest",
      "Interest paid out",
      "Withdrawals",
      "Internal transfers",
      "Separate fees",
      "Closing booked balance",
      "Accrued uncredited",
      "Total assets",
      "Cumulative external contributions",
      "Cumulative net interest",
      "Unfunded amount",
    ],
    projection.rows.map((row) => [
      row.month,
      row.opening,
      row.capitalIntroduced,
      row.contributions,
      row.interest,
      row.credited,
      row.reinvested,
      row.paidOut,
      row.withdrawals,
      row.transfers,
      row.fees,
      row.closing,
      row.accrued,
      row.assets,
      row.cumulativeContributions,
      row.cumulativeInterest,
      row.shortfall,
    ]),
  );
}

export function transactionsCsv(scenario: Scenario): string {
  return makeCsv(
    ["ID", "Date", "Timing", "Type", "Account", "Destination", "Amount", "Currency", "Note"],
    expandedTransactions(scenario).map((transaction) => [
      transaction.id,
      transaction.date,
      transaction.timing,
      transaction.type,
      scenario.accounts.find((account) => account.id === transaction.accountId)?.name,
      scenario.accounts.find((account) => account.id === transaction.destinationId)?.name,
      transaction.amount,
      scenario.currency,
      transaction.note,
    ]),
  );
}

export function baselineDifference(baseline: BaselineRow, calculated: string): string | null {
  const header = Object.keys(baseline.mapping).find((key) => baseline.mapping[key] === "balance");
  const value = header ? parseNumber(baseline.values[header]) : null;
  return value === null ? null : new Decimal(calculated).minus(value).toString();
}

export function download(name: string, data: string, type: string): void {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const element = document.createElement("a");
  element.href = url;
  element.download = name;
  element.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function formattedMonth(month: string): string {
  return date(`${month}-01`).toLocaleDateString("en-KE", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}
