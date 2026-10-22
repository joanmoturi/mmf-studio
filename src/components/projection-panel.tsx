"use client";

import { useState } from "react";
import Decimal from "decimal.js";
import { type AccountMonth, type PortfolioMonth, type Projection } from "@/lib/engine";
import type { Scenario, Workspace } from "@/lib/model";
import { baselineDifference, formattedMonth, parseMonth } from "@/lib/io";
import { Dialog, Field, SectionTitle, currency } from "./shared";

export interface ChartSeries {
  name: string;
  values: number[];
  color: string;
}

export function LineChart({
  title,
  labels,
  series,
  currencyCode,
}: {
  title: string;
  labels: string[];
  series: ChartSeries[];
  currencyCode: string;
}) {
  const width = 760,
    height = 210,
    left = 68,
    top = 16,
    bottom = 30;
  const values = series.flatMap((item) => item.values);
  const min = Math.min(0, ...values),
    max = Math.max(1, ...values);
  const y = (value: number) => top + ((max - value) / (max - min)) * (height - top - bottom);
  const x = (index: number) =>
    left + (index / Math.max(1, labels.length - 1)) * (width - left - 16);
  return (
    <article className="card chart-card">
      <h3>{title}</h3>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={title}>
        <title>{title}; exact values are available in the monthly tables.</title>
        {[0, 0.5, 1].map((fraction) => {
          const value = min + (max - min) * fraction;
          return (
            <g key={fraction}>
              <line x1={left} x2={width - 16} y1={y(value)} y2={y(value)} stroke="#e6e8df" />
              <text x={left - 8} y={y(value) + 4} textAnchor="end" className="axis-label">
                {currency(value, currencyCode, true)}
              </text>
            </g>
          );
        })}
        {series.map((item) => (
          <polyline
            key={item.name}
            fill="none"
            stroke={item.color}
            strokeWidth="2.5"
            points={item.values.map((value, index) => `${x(index)},${y(value)}`).join(" ")}
          />
        ))}
        {[...new Set([0, Math.floor((labels.length - 1) / 2), labels.length - 1])]
          .filter((index) => index >= 0)
          .map((index) => (
            <text
              key={index}
              x={x(index)}
              y={height - 5}
              textAnchor={index === 0 ? "start" : index === labels.length - 1 ? "end" : "middle"}
              className="axis-label"
            >
              {labels[index]}
            </text>
          ))}
      </svg>
      <div className="chart-legend">
        {series.map((item) => (
          <span key={item.name}>
            <i style={{ background: item.color }} />
            {item.name}
          </span>
        ))}
      </div>
    </article>
  );
}

const optionalColumns = [
  ["gross", "Gross interest (reference)"],
  ["tax", "Interest tax (reference)"],
  ["netIncome", "Net investment income after fees"],
  ["credited", "Interest credited"],
  ["reinvested", "Reinvested"],
  ["paidOut", "Interest paid out"],
  ["fees", "Separate fees"],
  ["accrued", "Uncredited accrual"],
  ["transfers", "Transfers"],
  ["capitalIntroduced", "Opening capital added"],
  ["shortfall", "Unfunded"],
] as const;

export function ProjectionPanel({
  scenario,
  projection,
  preferences,
  update,
  setPreferences,
}: {
  scenario: Scenario;
  projection: Projection;
  preferences: Workspace["preferences"];
  update: (scenario: Scenario) => void;
  setPreferences: (preferences: Workspace["preferences"]) => void;
}) {
  const [expanded, setExpanded] = useState("");
  const [depositDay, setDepositDay] = useState(1);
  const [depositTiming, setDepositTiming] = useState<"start" | "end">("start");
  const selected = scenario.accounts.find((account) => account.id === preferences.accountId);
  const editAccount = selected ?? scenario.accounts.find((account) => account.status === "active");
  const [year, setYear] = useState("");
  const selectedRows = projection.rows.filter((row) => !year || row.month.startsWith(year));
  const chartRows =
    preferences.chartPeriod === "monthly"
      ? selectedRows.slice(-12)
      : preferences.chartPeriod === "annual"
        ? projection.rows.filter(
            (row, index, all) =>
              index === all.length - 1 ||
              row.month.slice(0, 4) !== all[index + 1].month.slice(0, 4),
          )
        : selectedRows;
  const labels = chartRows.map((row) => row.month);
  const visible = optionalColumns.filter(
    ([key]) => preferences.view === "detailed" && preferences.visibleColumns.includes(key),
  );
  const override = (month: string, amount: string) => {
    if (!editAccount) return;
    update({
      ...scenario,
      contributionOverrides: [
        ...scenario.contributionOverrides.filter(
          (item) => item.accountId !== editAccount.id || item.month !== month,
        ),
        {
          accountId: editAccount.id,
          month,
          amount: amount || "0",
          day: depositDay,
          timing: depositTiming,
        },
      ],
    });
  };
  const paste = (event: React.ClipboardEvent) => {
    const text = event.clipboardData.getData("text/plain");
    if (!text.includes("\t") || !editAccount) return;
    event.preventDefault();
    const parsed = text
      .trim()
      .split(/\r?\n/)
      .map((line) => {
        const [rawMonth, amount] = line.split("\t");
        const month = parseMonth(rawMonth);
        if (!month || !/^\d+(\.\d+)?$/.test(amount?.replace(/,/g, "") ?? "")) return null;
        return {
          accountId: editAccount.id,
          month,
          amount: amount.replace(/,/g, ""),
          day: depositDay,
          timing: depositTiming,
        };
      });
    if (parsed.some((item) => !item)) {
      window.alert("Paste two columns: Month (YYYY-MM) and a non-negative deposit amount.");
      return;
    }
    const entries = parsed.filter((item) => item !== null);
    update({
      ...scenario,
      contributionOverrides: [
        ...scenario.contributionOverrides.filter(
          (item) =>
            !entries.some(
              (entry) => entry.accountId === item.accountId && entry.month === item.month,
            ),
        ),
        ...entries,
      ],
    });
  };
  return (
    <>
      <SectionTitle eyebrow="THE BIG PICTURE" title="Small decisions. Long-term possibilities.">
        <span className="tag">
          {scenario.accounts.length} accounts · {projection.rows.length} months
        </span>
      </SectionTitle>
      <div className="chart-grid">
        <LineChart
          title="Your capital, working over time"
          labels={labels}
          currencyCode={scenario.currency}
          series={[
            {
              name: "Portfolio assets",
              values: chartRows.map((row) => Number(row.assets)),
              color: "#315943",
            },
            {
              name: "Opening capital + external deposits",
              values: chartRows.map(
                (row) =>
                  Number(projection.openingCapital) +
                  projection.rows
                    .filter((item) => item.month <= row.month)
                    .reduce((total, item) => total + Number(item.capitalIntroduced), 0) +
                  Number(row.cumulativeContributions),
              ),
              color: "#bd8a4f",
            },
          ]}
        />
        <LineChart
          title="Net interest earned by period"
          labels={labels}
          currencyCode={scenario.currency}
          series={[
            {
              name:
                preferences.chartPeriod === "annual"
                  ? "Calendar-year net interest"
                  : "Monthly net interest",
              values: chartRows.map((row) =>
                preferences.chartPeriod === "annual"
                  ? projection.rows
                      .filter((item) => item.month.startsWith(row.month.slice(0, 4)))
                      .reduce((total, item) => total + Number(item.interest), 0)
                  : Number(row.interest),
              ),
              color: "#315943",
            },
            ...(scenario.goal.enabled &&
            preferences.chartPeriod !== "annual" &&
            Number(scenario.goal.monthlyIncome) > 0
              ? [
                  {
                    name: "Monthly interest target",
                    values: chartRows.map(() => Number(scenario.goal.monthlyIncome)),
                    color: "#bd8a4f",
                  },
                ]
              : []),
          ]}
        />
      </div>
      {!!scenario.accounts.length && (
        <details className="chart-details">
          <summary>Individual account balances</summary>
          <LineChart
            title="Individual account assets"
            labels={labels}
            currencyCode={scenario.currency}
            series={scenario.accounts.map((account, index) => ({
              name: account.name,
              values: chartRows.map((row) =>
                Number(row.accounts.find((item) => item.accountId === account.id)?.assets ?? 0),
              ),
              color: ["#315943", "#bd8a4f", "#476b95", "#986e95", "#7d8350"][index % 5],
            }))}
          />
        </details>
      )}
      <section className="card projection-card">
        <div className="section-title">
          <div>
            <h3>Your monthly plan</h3>
            <p className="muted">
              Calculated from your accounts and dated transactions. Baseline figures stay separate.
            </p>
          </div>
          <div className="segmented">
            <button
              aria-pressed={preferences.view === "compact"}
              onClick={() => setPreferences({ ...preferences, view: "compact" })}
            >
              Compact
            </button>
            <button
              aria-pressed={preferences.view === "detailed"}
              onClick={() => setPreferences({ ...preferences, view: "detailed" })}
            >
              Detailed
            </button>
          </div>
        </div>
        <div className="table-toolbar">
          <Field label="View">
            <select
              value={selected?.id ?? ""}
              onChange={(event) =>
                setPreferences({ ...preferences, accountId: event.target.value })
              }
            >
              <option value="">Consolidated portfolio</option>
              {scenario.accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Table year">
            <select value={year} onChange={(event) => setYear(event.target.value)}>
              <option value="">All years</option>
              {[...new Set(projection.rows.map((row) => row.month.slice(0, 4)))].map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </Field>
          <Field label="Chart period">
            <select
              value={preferences.chartPeriod}
              onChange={(event) =>
                setPreferences({
                  ...preferences,
                  chartPeriod: event.target.value as typeof preferences.chartPeriod,
                })
              }
            >
              <option value="all">Full projection</option>
              <option value="monthly">Latest 12 selected months</option>
              <option value="annual">Year-end / annual totals</option>
            </select>
          </Field>
          <Field label="Deposit override day">
            <input
              type="number"
              min="1"
              max="31"
              value={depositDay}
              onChange={(event) => setDepositDay(Number(event.target.value))}
            />
          </Field>
          <Field label="Deposit override timing">
            <select
              value={depositTiming}
              onChange={(event) => setDepositTiming(event.target.value as typeof depositTiming)}
            >
              <option value="start">Start of day</option>
              <option value="end">End of day</option>
            </select>
          </Field>
        </div>
        {preferences.view === "detailed" && (
          <div className="column-controls">
            {optionalColumns.map(([key, label]) => (
              <label key={key} className="check">
                <input
                  type="checkbox"
                  checked={preferences.visibleColumns.includes(key)}
                  onChange={(event) =>
                    setPreferences({
                      ...preferences,
                      visibleColumns: event.target.checked
                        ? [...preferences.visibleColumns, key]
                        : preferences.visibleColumns.filter((item) => item !== key),
                    })
                  }
                />
                {label}
              </label>
            ))}
          </div>
        )}
        <p className="table-help">
          Editable deposit cells apply to{" "}
          <strong>{editAccount?.name ?? "an account you add"}</strong>. An edit explicitly replaces
          that account&apos;s scheduled and one-off external deposits for the month, using the
          day/timing above. Tab to navigate; Enter to commit. Paste Month + Amount columns to edit
          several months. Other figures are calculated.
        </p>
        <div className="table-wrap monthly-table" onPaste={paste}>
          <table>
            <thead>
              <tr>
                <th>Month</th>
                <th>Opening balance</th>
                {!selected &&
                  scenario.accounts.map((account) => (
                    <th key={account.id}>{account.name} interest</th>
                  ))}
                <th>Net interest earned</th>
                <th>External deposits</th>
                <th>
                  {editAccount?.name ?? "Account"} deposit{" "}
                  <span className="editable-tag">EDIT</span>
                </th>
                <th>Withdrawals</th>
                {visible.map(([key, label]) => (
                  <th key={key}>{label}</th>
                ))}
                <th>Closing balance</th>
                <th>Total assets</th>
                <th>Contributions to date</th>
                {scenario.goal.enabled && <th>Balance target progress</th>}
                <th>Audit</th>
              </tr>
            </thead>
            <tbody>
              {selectedRows.map((portfolio) => {
                const row: AccountMonth | PortfolioMonth = selected
                  ? portfolio.accounts.find((item) => item.accountId === selected.id)!
                  : portfolio;
                const editRow = portfolio.accounts.find(
                  (item) => item.accountId === editAccount?.id,
                );
                const currentOverride = scenario.contributionOverrides.find(
                  (item) => item.month === portfolio.month && item.accountId === editAccount?.id,
                );
                const contributions = selected
                  ? projection.rows
                      .filter((item) => item.month <= portfolio.month)
                      .reduce(
                        (total, item) =>
                          total.plus(
                            item.accounts.find((account) => account.accountId === selected.id)!
                              .contributions,
                          ),
                        new Decimal(0),
                      )
                      .toString()
                  : portfolio.cumulativeContributions;
                const cell = (key: string) =>
                  key === "netIncome"
                    ? new Decimal(row.interest).minus(row.fees).toString()
                    : key === "transfers"
                      ? "transfers" in row
                        ? row.transfers
                        : row.transfersOut
                      : String(row[key as keyof typeof row] ?? 0);
                return (
                  <tr key={portfolio.month} className={currentOverride ? "has-override" : ""}>
                    <th scope="row">{formattedMonth(portfolio.month)}</th>
                    <td>{currency(row.opening, scenario.currency)}</td>
                    {!selected &&
                      portfolio.accounts.map((account) => (
                        <td key={account.accountId} className="interest-cell">
                          {currency(account.interest, scenario.currency)}
                        </td>
                      ))}
                    <td className="interest-cell">{currency(row.interest, scenario.currency)}</td>
                    <td>{currency(row.contributions, scenario.currency)}</td>
                    <td>
                      <input
                        key={`${editAccount?.id}:${editRow?.contributions}`}
                        className="cell-input"
                        type="number"
                        min="0"
                        step="any"
                        aria-label={`Deposit ${portfolio.month}`}
                        disabled={!editAccount}
                        defaultValue={new Decimal(editRow?.contributions ?? 0).toFixed(2)}
                        onBlur={(event) => {
                          const value = event.currentTarget.value || "0";
                          if (
                            !new Decimal(value).eq(
                              new Decimal(editRow?.contributions ?? 0).toFixed(2),
                            )
                          )
                            override(portfolio.month, value);
                        }}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") event.currentTarget.blur();
                          if (event.key === "Escape") {
                            event.currentTarget.value = new Decimal(
                              editRow?.contributions ?? 0,
                            ).toFixed(2);
                            event.currentTarget.blur();
                          }
                        }}
                      />
                    </td>
                    <td>{currency(row.withdrawals, scenario.currency)}</td>
                    {visible.map(([key]) => (
                      <td key={key}>
                        {key === "gross" || key === "tax"
                          ? "Not reconciled"
                          : currency(cell(key), scenario.currency)}
                      </td>
                    ))}
                    <td className="balance-cell">{currency(row.closing, scenario.currency)}</td>
                    <td>{currency(row.assets, scenario.currency)}</td>
                    <td>{currency(contributions, scenario.currency)}</td>
                    {scenario.goal.enabled && (
                      <td>
                        {Number(scenario.goal.portfolioTarget) > 0
                          ? `${((Number(row.assets) / Number(scenario.goal.portfolioTarget)) * 100).toFixed(1)}%`
                          : "No balance target"}
                      </td>
                    )}
                    <td>
                      <button
                        aria-label={`Inspect ${portfolio.month}`}
                        onClick={() =>
                          setExpanded(expanded === portfolio.month ? "" : portfolio.month)
                        }
                      >
                        Inspect
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="footnote">
          Closing balance is booked cash. Total assets = booked cash + accrued uncredited interest.
          Reinvested returns are not external deposits or spendable cash. Gross interest and tax are
          unavailable unless explicitly reconciled from provider information.
        </p>
      </section>
      {expanded && (
        <AuditPanel
          scenario={scenario}
          row={projection.rows.find((row) => row.month === expanded)!}
          selected={selected?.id}
          close={() => setExpanded("")}
        />
      )}
    </>
  );
}

function AuditPanel({
  scenario,
  row,
  selected,
  close,
}: {
  scenario: Scenario;
  row: PortfolioMonth;
  selected?: string;
  close: () => void;
}) {
  const baseline = scenario.baseline.find((item) => item.month === row.month);
  const difference = baseline ? baselineDifference(baseline, row.assets) : null;
  return (
    <Dialog label={`Calculation audit ${row.month}`} onClose={close}>
      <div className="section-title">
        <h2>Inside {formattedMonth(row.month)}</h2>
        <button onClick={close}>Close</button>
      </div>
      {row.accounts
        .filter((account) => !selected || account.accountId === selected)
        .map((account) => (
          <section key={account.accountId} className="audit-account">
            <h3>{scenario.accounts.find((item) => item.id === account.accountId)?.name}</h3>
            <p className="reconciliation">
              {currency(account.opening, scenario.currency)} opening +{" "}
              {currency(account.capitalIntroduced, scenario.currency)} opening capital +{" "}
              {currency(account.contributions, scenario.currency)} external deposits +{" "}
              {currency(account.transfersIn, scenario.currency)} transfers in +{" "}
              {currency(account.credited, scenario.currency)} net credit −{" "}
              {currency(account.withdrawals, scenario.currency)} withdrawals −{" "}
              {currency(account.transfersOut, scenario.currency)} transfers out −{" "}
              {currency(account.fees, scenario.currency)} fees ={" "}
              <strong>{currency(account.closing, scenario.currency)} closing</strong>
            </p>
            <p>
              Earned this month: {currency(account.interest, scenario.currency)}. Pending credit:{" "}
              {currency(account.accrued, scenario.currency)}. Retained interest credited:{" "}
              {currency(account.reinvested, scenario.currency)}.
            </p>
            <div className="audit-events">
              {account.audit.map((entry, index) => (
                <div key={index}>
                  <span>{entry.date}</span>
                  <strong>{entry.kind}</strong>
                  <span>{entry.amount}</span>
                  <p>{entry.detail}</p>
                </div>
              ))}
            </div>
          </section>
        ))}
      {baseline && (
        <section>
          <h3>Imported baseline — unchanged</h3>
          <pre>{JSON.stringify(baseline.values, null, 2)}</pre>
          <p>
            Calculated assets minus imported total balance:{" "}
            {difference === null
              ? "Map a Total Balance column first."
              : currency(difference, scenario.currency)}
          </p>
          <p className="footnote">
            Differences are not concealed. Matching requires confirmed opening capital, rate
            conventions, transaction timing, and column meanings.
          </p>
        </section>
      )}
    </Dialog>
  );
}
