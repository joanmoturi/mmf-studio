"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import Link from "next/link";
import { evaluateIncome, incomeCapacity, project } from "@/lib/engine";
import { newWorkspace, workspaceSchema, type Scenario, type Workspace } from "@/lib/model";
import {
  BACKUP_KEY,
  STORAGE_KEY,
  loadWorkspace,
  parseWorkspace,
  saveWorkspace,
} from "@/lib/storage";
import { AccountPanel } from "./account-panel";
import { TransactionPanel } from "./transaction-panel";
import { ProjectionPanel } from "./projection-panel";
import { FreedomPanel } from "./freedom-panel";
import { ScenarioPanel } from "./scenario-panel";
import { DataPanel } from "./data-panel";
import { Field, currency, errorText } from "./shared";
import { PwaPanel } from "./pwa-panel";

const tabs = [
  ["projection", "Monthly projection"],
  ["accounts", "Accounts"],
  ["transactions", "Transactions"],
  ["freedom", "Financial freedom"],
  ["scenarios", "Scenarios"],
  ["data", "Data & recovery"],
] as const;
type Tab = (typeof tabs)[number][0];

export function Planner() {
  const [loaded] = useState(() => {
    try {
      return loadWorkspace(localStorage);
    } catch {
      return {
        workspace: newWorkspace(),
        blocked: true,
        error:
          "Browser storage is unavailable. Enable site storage before editing; no saved data has been replaced.",
      };
    }
  });
  const [workspace, setWorkspace] = useState(loaded.workspace);
  const [blocked, setBlocked] = useState(loaded.blocked);
  const [error, setError] = useState(loaded.error ?? "");
  const [saved, setSaved] = useState(false);
  const [currentMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });
  const [tab, setTab] = useState<Tab>(loaded.blocked ? "data" : "projection");
  const backupInput = useRef<HTMLInputElement>(null);
  const [history, setHistory] = useState<{ past: Workspace[]; future: Workspace[] }>({
    past: [],
    future: [],
  });
  const scenario = workspace.scenarios.find((item) => item.id === workspace.activeId)!;
  const projection = useMemo(() => project(scenario), [scenario]);
  const latest = projection.rows.at(-1)!;
  const current = projection.rows.find((row) => row.month === currentMonth);
  const capacity = useMemo(() => incomeCapacity(scenario, latest), [scenario, latest]);
  const incomeGoal = useMemo(() => evaluateIncome(scenario, projection), [scenario, projection]);

  useEffect(() => {
    const changed = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY) {
        setBlocked(true);
        setError(
          "The workspace changed in another tab. Reload this tab before editing to avoid overwriting that change. You can export this tab's current plan first.",
        );
      }
    };
    window.addEventListener("storage", changed);
    return () => window.removeEventListener("storage", changed);
  }, []);

  const commit = (next: Workspace, trackHistory = true): boolean => {
    if (blocked) {
      setError("Editing is paused to protect stored data. Reload or use Data & recovery.");
      return false;
    }
    try {
      const valid = workspaceSchema.parse(next);
      const raw = localStorage.getItem(STORAGE_KEY);
      if (
        raw &&
        JSON.stringify(parseWorkspace(raw)) !== JSON.stringify(workspaceSchema.parse(workspace))
      )
        throw new Error(
          "Stored data changed outside this tab. Reload before editing; your current view has not been saved over it.",
        );
      saveWorkspace(localStorage, valid);
      if (trackHistory) {
        setHistory((old) => ({ past: [...old.past.slice(-29), workspace], future: [] }));
      }
      setWorkspace(valid);
      setError("");
      setSaved(true);
      return true;
    } catch (caught) {
      setError(errorText(caught));
      setSaved(false);
      return false;
    }
  };
  const updateScenario = (next: Scenario): boolean =>
    commit({
      ...workspace,
      scenarios: workspace.scenarios.map((item) => (item.id === next.id ? next : item)),
    });
  const preferences = (next: Workspace["preferences"]) =>
    commit({ ...workspace, preferences: next });
  const replaceRecovery = (next: Workspace): boolean => {
    try {
      const valid = workspaceSchema.parse(next);
      const original = localStorage.getItem(STORAGE_KEY);
      if (original) localStorage.setItem("mmf-studio.recovery-original.v1", original);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(valid));
      setWorkspace(valid);
      setBlocked(false);
      setError("");
      setSaved(true);
      setHistory({ past: [], future: [] });
      return true;
    } catch (caught) {
      setError(errorText(caught));
      return false;
    }
  };
  const recover = () => {
    try {
      const previous = localStorage.getItem(BACKUP_KEY);
      if (!previous) throw new Error("There is no previous saved copy yet.");
      const valid = parseWorkspace(previous);
      if (
        window.confirm(
          "Restore the previous saved workspace? The current stored text will be kept as a recovery original.",
        )
      )
        replaceRecovery(valid);
    } catch (caught) {
      setError(errorText(caught));
    }
  };
  const undo = () => {
    const previous = history.past.at(-1);
    if (previous && commit(previous, false)) {
      setHistory((old) => ({ past: old.past.slice(0, -1), future: [...old.future, workspace] }));
    }
  };
  const redo = () => {
    const next = history.future.at(-1);
    if (next && commit(next, false)) {
      setHistory((old) => ({ past: [...old.past, workspace], future: old.future.slice(0, -1) }));
    }
  };
  return (
    <div className="app-shell">
      <header className="app-header">
        <Link className="brand" href="/" aria-label="MMF Studio home">
          <span className="brand-mark">M</span>
          <div>
            <strong>
              MMF<span>STUDIO</span>
            </strong>
            <small>Your path, in perspective.</small>
          </div>
        </Link>
        <div className="header-right">
          <span className={`save-status ${blocked ? "status-error" : ""}`} role="status">
            <i />
            {blocked
              ? "Recovery needed"
              : saved
                ? "Saved in this browser"
                : "Local-first workspace"}
          </span>
          <button className="quiet" onClick={() => downloadBackup(workspace)}>
            ↓ Back up plan
          </button>
          <button
            className="quiet"
            onClick={() => {
              // Mount the picker in this click so mobile browsers keep the user gesture.
              flushSync(() => setTab("data"));
              backupInput.current?.scrollIntoView({ block: "center" });
              backupInput.current?.click();
            }}
          >
            Upload JSON backup
          </button>
        </div>
      </header>
      <PwaPanel />
      <div className="workspace-header">
        <div>
          <p className="eyebrow">PERSONAL INVESTMENT PLANNER</p>
          <h1>
            Build a future with more freedom<span>.</span>
          </h1>
          <p className="muted">
            A practical view of your money, your returns, and the choices ahead.
          </p>
        </div>
        <div className="scenario-picker">
          <Field label="YOUR SCENARIO">
            <select
              aria-label="Active scenario"
              value={workspace.activeId}
              disabled={blocked}
              onChange={(event) => commit({ ...workspace, activeId: event.target.value })}
            >
              {workspace.scenarios.map((item) => (
                <option value={item.id} key={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </Field>
        </div>
      </div>
      <div className="assumptions-strip">
        <span>
          <i /> Annual net rates after tax
        </span>
        <span>
          <i /> Full reinvestment by default
        </span>
        <span>
          <i /> No goal required
        </span>
        <span className="privacy-note">Private by design · stored on this device</span>
      </div>
      {error && (
        <div role="alert" className="global-error">
          <strong>Not saved:</strong> {error}
          <button onClick={() => setTab("data")}>Data & recovery</button>
          <button onClick={() => setError("")} aria-label="Dismiss error">
            Dismiss
          </button>
        </div>
      )}
      <div className="metric-grid top-metrics">
        <article className="metric featured">
          <span>PROJECTED PORTFOLIO ASSETS</span>
          <strong>{currency(latest.assets, scenario.currency)}</strong>
          <small>At {scenario.end} · includes uncredited accrual</small>
          {current && (
            <small>
              Current-month projection ({currentMonth}):{" "}
              {currency(current.assets, scenario.currency)}
            </small>
          )}
        </article>
        <article className="metric">
          <span>EXTERNAL CONTRIBUTIONS</span>
          <strong>{currency(latest.cumulativeContributions, scenario.currency)}</strong>
          <small>Opening capital: {currency(projection.openingCapital, scenario.currency)}</small>
        </article>
        <article className="metric">
          <span>NET INTEREST EARNED</span>
          <strong>{currency(latest.cumulativeInterest, scenario.currency)}</strong>
          <small>
            Retained credits: {currency(latest.cumulativeReinvested, scenario.currency)}
          </small>
        </article>
        <article className="metric">
          <span>LATEST MONTH&apos;S NET INTEREST</span>
          <strong>{currency(latest.interest, scenario.currency)}</strong>
          <small>
            Forward-year payout estimate: {currency(capacity.annual, scenario.currency)}
          </small>
        </article>
      </div>
      {scenario.goal.enabled && (
        <div className="goal-banner">
          <span>
            Interest-income target:{" "}
            <strong>
              {incomeGoal.hasTarget
                ? (incomeGoal.achieved?.month ?? "Not reached within horizon")
                : "Set a positive target"}
            </strong>
          </span>
          <span>
            Monthly target surplus / shortfall:{" "}
            <strong>{currency(incomeGoal.monthlyGap, scenario.currency)}</strong>
          </span>
          <button onClick={() => setTab("freedom")}>Compare strategies →</button>
        </div>
      )}
      <div className="navigation-row">
        <nav aria-label="Planner sections">
          {tabs.map(([key, label]) => (
            <button
              key={key}
              aria-current={tab === key ? "page" : undefined}
              onClick={() => setTab(key)}
            >
              {label}
            </button>
          ))}
        </nav>
        <div className="history-controls">
          <button
            title="Undo last workspace edit"
            disabled={blocked || !history.past.length}
            onClick={undo}
          >
            ↶ Undo
          </button>
          <button
            title="Redo workspace edit"
            disabled={blocked || !history.future.length}
            onClick={redo}
          >
            ↷ Redo
          </button>
        </div>
      </div>
      <main>
        {tab !== "data" && (
          <fieldset disabled={blocked} className="workspace-content">
            {tab === "projection" && (
              <>
                <Timeline
                  key={`${scenario.id}:${scenario.start}:${scenario.end}`}
                  scenario={scenario}
                  update={updateScenario}
                />
                <ProjectionPanel
                  scenario={scenario}
                  projection={projection}
                  preferences={workspace.preferences}
                  update={updateScenario}
                  setPreferences={preferences}
                />
              </>
            )}
            {tab === "accounts" && <AccountPanel scenario={scenario} update={updateScenario} />}
            {tab === "transactions" && (
              <TransactionPanel scenario={scenario} update={updateScenario} />
            )}
            {tab === "freedom" && (
              <FreedomPanel
                key={`${scenario.id}:${JSON.stringify(scenario.goal)}`}
                scenario={scenario}
                projection={projection}
                preferences={workspace.preferences}
                update={updateScenario}
                setPreferences={preferences}
              />
            )}
            {tab === "scenarios" && (
              <ScenarioPanel key={scenario.id} workspace={workspace} commit={commit} />
            )}
          </fieldset>
        )}
        {tab === "data" && (
          <DataPanel
            workspace={workspace}
            projection={projection}
            commit={blocked ? replaceRecovery : commit}
            recover={recover}
            backupInputRef={backupInput}
          />
        )}
        {projection.warnings.length > 0 && (
          <details className="warnings card">
            <summary>{projection.warnings.length} projection funding warnings</summary>
            {projection.warnings.map((warning) => (
              <p key={warning}>{warning}</p>
            ))}
          </details>
        )}
      </main>
      <footer>
        <span className="brand-footer">MMF STUDIO</span>
        <p>
          A planning tool, not a promise. Returns, rates, inflation, and capital-preservation
          results depend on your assumptions. Reinvested interest is not simultaneously spendable
          income. No financial data is sent to external services.
        </p>
        <span>Made for the long view.</span>
      </footer>
    </div>
  );
}

function Timeline({
  scenario,
  update,
}: {
  scenario: Scenario;
  update: (scenario: Scenario) => boolean;
}) {
  const [start, setStart] = useState(scenario.start);
  const [end, setEnd] = useState(scenario.end);
  const [code, setCode] = useState(scenario.currency);
  return (
    <form
      className="timeline-form"
      onSubmit={(event) => {
        event.preventDefault();
        update({ ...scenario, start, end, currency: code });
      }}
    >
      <div className="timeline-label">
        <span className="eyebrow">PROJECTION WINDOW</span>
        <small>Historical periods are editable assumptions, not actual returns.</small>
      </div>
      <Field label="Start month">
        <input
          type="month"
          required
          value={start}
          onChange={(event) => setStart(event.target.value)}
        />
      </Field>
      <span className="timeline-arrow">→</span>
      <Field label="End month">
        <input type="month" required value={end} onChange={(event) => setEnd(event.target.value)} />
      </Field>
      <Field label="Currency">
        <select
          value={code}
          disabled={!!scenario.accounts.length}
          onChange={(event) => setCode(event.target.value)}
        >
          {["KES", "USD", "GBP", "EUR", "UGX", "TZS"].map((value) => (
            <option key={value}>{value}</option>
          ))}
        </select>
      </Field>
      <button type="submit">Apply timeline</button>
    </form>
  );
}

function downloadBackup(workspace: Workspace): void {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(workspace, null, 2)], { type: "application/json" }),
  );
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "mmf-workspace.json";
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
