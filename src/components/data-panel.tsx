"use client";

import { useMemo, useState } from "react";
import { newId, workspaceSchema, type Workspace } from "@/lib/model";
import { parseWorkspace, STORAGE_KEY, BACKUP_KEY } from "@/lib/storage";
import {
  SAMPLE_BASELINE,
  download,
  makeCsv,
  parseCsv,
  previewBaseline,
  projectionCsv,
  readFile,
  transactionsCsv,
  type ImportData,
} from "@/lib/io";
import { type Projection } from "@/lib/engine";
import { Field, SectionTitle, errorText } from "./shared";

export function DataPanel({
  workspace,
  projection,
  commit,
  recover,
}: {
  workspace: Workspace;
  projection: Projection;
  commit: (workspace: Workspace) => boolean;
  recover: () => void;
}) {
  const scenario = workspace.scenarios.find((item) => item.id === workspace.activeId)!;
  const [data, setData] = useState<ImportData | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [pending, setPending] = useState<Workspace | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const preview = useMemo(() => (data ? previewBaseline(data, mapping) : null), [data, mapping]);
  const stage = (next: ImportData) => {
    setData(next);
    setMapping({});
    setError("");
    setMessage("");
  };
  const workbook = async () => {
    setBusy(true);
    setError("");
    try {
      const { default: writeXlsxFile } = await import("write-excel-file/browser");
      const table = parseCsv(projectionCsv(projection));
      const json = JSON.stringify(workspaceSchema.parse(workspace));
      const chunks = json.match(/[\s\S]{1,30000}/g) ?? [];
      await writeXlsxFile([
        {
          sheet: "Monthly projection",
          data: [table.headers, ...table.rows].map((row) =>
            row.map((value) => ({ type: String, value })),
          ),
        },
        {
          sheet: "Assumptions and backup",
          data: [
            [
              {
                type: String,
                value:
                  "Versioned workspace JSON in ordered chunks; JSON backup is the supported full-plan restore format.",
              },
            ],
            ...chunks.map((chunk, index) => [
              { type: String, value: String(index + 1) },
              { type: String, value: chunk },
            ]),
          ],
        },
      ]).toFile("mmf-projection.xlsx");
    } catch (caught) {
      setError(errorText(caught));
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <SectionTitle eyebrow="YOUR DATA, IN YOUR HANDS" title="Back up. Import. Reconcile.">
        <span className="tag">No external account data services</span>
      </SectionTitle>
      <div className="notice">
        Plans are stored in this browser, on this origin. Clearing site data, changing browser, or
        switching between localhost and 127.0.0.1 can make a different workspace appear. Download
        JSON backups regularly.
      </div>
      <section className="card">
        <h3>Export your plan</h3>
        <p className="muted">
          JSON restores the complete workspace. CSV and XLSX are spreadsheet-compatible views; full
          assumptions are included in JSON and the XLSX backup sheet.
        </p>
        <div className="actions wrap">
          <button
            className="primary"
            onClick={() =>
              download("mmf-workspace.json", JSON.stringify(workspace, null, 2), "application/json")
            }
          >
            Download full JSON backup
          </button>
          <button
            onClick={() =>
              download("mmf-projection.csv", projectionCsv(projection), "text/csv;charset=utf-8")
            }
          >
            Export monthly CSV
          </button>
          <button
            onClick={() =>
              download("mmf-transactions.csv", transactionsCsv(scenario), "text/csv;charset=utf-8")
            }
          >
            Export transactions CSV
          </button>
          <button disabled={busy} onClick={workbook}>
            {busy ? "Preparing workbook..." : "Export Excel workbook"}
          </button>
          {scenario.baseline.length > 0 && (
            <button
              onClick={() => {
                const headers = [
                  ...new Set(scenario.baseline.flatMap((row) => Object.keys(row.values))),
                ];
                download(
                  "mmf-baseline.csv",
                  makeCsv(
                    headers,
                    scenario.baseline.map((row) =>
                      headers.map((header) => row.values[header] ?? ""),
                    ),
                  ),
                  "text/csv;charset=utf-8",
                );
              }}
            >
              Export original baseline CSV
            </button>
          )}
        </div>
      </section>
      <div className="two-column">
        <section className="card">
          <h3>Restore a full workspace</h3>
          <p className="muted">
            Validate and preview before replacing anything. The previous valid saved revision
            remains recoverable.
          </p>
          <Field label="Choose JSON backup">
            <input
              type="file"
              accept=".json,application/json"
              onChange={async (event) => {
                const file = event.target.files?.[0];
                if (!file) return;
                setError("");
                setPending(null);
                try {
                  if (file.size > 10 * 1024 * 1024) throw new Error("Backup exceeds 10 MB.");
                  setPending(parseWorkspace(await file.text()));
                } catch (caught) {
                  setError(errorText(caught));
                }
                event.target.value = "";
              }}
            />
          </Field>
          {pending && (
            <div className="import-preview">
              <p>
                <strong>{pending.scenarios.length} validated scenarios</strong> ·{" "}
                {pending.scenarios.reduce((total, item) => total + item.accounts.length, 0)} account
                records
              </p>
              <p>{pending.scenarios.map((item) => item.name).join(", ")}</p>
              <div className="actions">
                <button onClick={() => setPending(null)}>Cancel</button>
                <button
                  className="primary"
                  onClick={() => {
                    if (
                      !window.confirm(
                        "Replace this workspace with the validated backup? The previous saved revision will be retained.",
                      )
                    )
                      return;
                    if (commit(pending)) {
                      setPending(null);
                      setMessage("Workspace restored and saved.");
                    }
                  }}
                >
                  Confirm workspace replacement
                </button>
                <button
                  onClick={() => {
                    const copies = pending.scenarios.map((item) => ({ ...item, id: newId() }));
                    if (commit({ ...workspace, scenarios: [...workspace.scenarios, ...copies] })) {
                      setPending(null);
                      setMessage("Backup imported as separate scenarios.");
                    }
                  }}
                >
                  Import as separate scenarios
                </button>
              </div>
            </div>
          )}
        </section>
        <section className="card">
          <h3>Recover a previous revision</h3>
          <p className="muted">
            Every successful edit keeps the preceding saved workspace. Recovery requires
            confirmation and preserves unreadable originals.
          </p>
          <div className="actions wrap">
            <button onClick={recover}>Restore previous saved copy</button>
            <button
              onClick={() => {
                try {
                  const raw = localStorage.getItem(STORAGE_KEY);
                  if (!raw) throw new Error("No stored workspace is available.");
                  download("mmf-original-recovery.txt", raw, "text/plain");
                } catch (caught) {
                  setError(errorText(caught));
                }
              }}
            >
              Export original recovery data
            </button>
            <button
              onClick={() => {
                try {
                  const raw = localStorage.getItem(BACKUP_KEY);
                  if (!raw) throw new Error("No previous copy exists yet.");
                  download("mmf-previous-workspace.json", raw, "application/json");
                } catch (caught) {
                  setError(errorText(caught));
                }
              }}
            >
              Export previous copy
            </button>
          </div>
        </section>
      </div>
      <section className="card">
        <h3>Import a spreadsheet baseline</h3>
        <p className="muted">
          Baseline figures are references, not transactions. Importing never creates accounts,
          allocates deposits, or assumes rates. Only the first worksheet of an XLSX file is read.
        </p>
        <div className="actions wrap">
          <Field label="Choose CSV or Excel baseline">
            <input
              type="file"
              accept=".csv,.xlsx"
              onChange={async (event) => {
                const file = event.target.files?.[0];
                if (!file) return;
                try {
                  stage(await readFile(file));
                } catch (caught) {
                  setError(errorText(caught));
                }
                event.target.value = "";
              }}
            />
          </Field>
          <button onClick={() => stage(parseCsv(SAMPLE_BASELINE))}>
            Preview supplied five-row sample
          </button>
        </div>
        {data && (
          <>
            <h4>Map source columns explicitly</h4>
            <div className="form-grid">
              {data.headers.map((header) => (
                <Field key={header} label={header}>
                  <select
                    aria-label={`Map ${header}`}
                    value={mapping[header] ?? "ignore"}
                    onChange={(event) =>
                      setMapping((old) => ({ ...old, [header]: event.target.value }))
                    }
                  >
                    <option value="ignore">Preserve, do not interpret</option>
                    <option value="reference">Custom reference value</option>
                    <option value="month">Month</option>
                    <option value="deposit">External deposits</option>
                    <option value="transfer">Transfers (meaning confirmed)</option>
                    <option value="interest">Total net interest</option>
                    <option value="balance">Total balance</option>
                    {scenario.accounts.map((account) => (
                      <option key={account.id} value={`account:${account.id}`}>
                        {account.name} interest
                      </option>
                    ))}
                  </select>
                </Field>
              ))}
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    {data.headers.map((header) => (
                      <th key={header}>{header}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.rows.slice(0, 8).map((row, index) => (
                    <tr key={index}>
                      {row.map((cell, column) => (
                        <td key={column}>{cell}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="muted">
              Previewing {Math.min(8, data.rows.length)} of {data.rows.length} rows. Dates: YYYY-MM,
              YYYY-MM-01, or English month + year. Numbers: decimal point with optional comma
              thousands separators.
            </p>
            {preview?.errors.map((item, index) => (
              <p className="error" key={index}>
                {item}
              </p>
            ))}
            {preview?.warnings.map((item, index) => (
              <p className="warning" key={index}>
                {item}
              </p>
            ))}
            <div className="actions">
              <button onClick={() => setData(null)}>Cancel import</button>
              <button
                className="primary"
                disabled={!preview || preview.errors.length > 0}
                onClick={() => {
                  if (
                    !preview ||
                    !window.confirm(
                      `Import ${preview.rows.length} rows as reference baseline${scenario.baseline.length ? " and replace this scenario's existing baseline" : ""}? No transactions will be created.`,
                    )
                  )
                    return;
                  if (
                    commit({
                      ...workspace,
                      scenarios: workspace.scenarios.map((item) =>
                        item.id === scenario.id ? { ...item, baseline: preview.rows } : item,
                      ),
                    })
                  ) {
                    setData(null);
                    setMessage(
                      "Baseline preserved. Use Inspect in the projection table to compare figures.",
                    );
                  }
                }}
              >
                Confirm baseline import
              </button>
            </div>
          </>
        )}
        <p className="footnote">
          Only five sample months were supplied. The complete August 2026–December 2030 baseline has
          not been fabricated. “IFB → A D” remains uninterpreted until you explicitly map it.
        </p>
      </section>
      {scenario.baseline.length > 0 && (
        <section className="card">
          <h3>Preserved baseline · {scenario.baseline.length} months</h3>
          <p>
            {scenario.baseline[0].month} → {scenario.baseline.at(-1)!.month}. Inspect a matching
            projection month to see original values and discrepancies.
          </p>
        </section>
      )}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="success">
          {message}
        </p>
      )}
    </>
  );
}
