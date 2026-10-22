"use client";

import { useMemo, useState } from "react";
import {
  earliestWithdrawal,
  evaluateIncome,
  evaluateWithdrawals,
  incomeCapacity,
  requiredFunding,
  requiredPortfolio,
  type FundingEstimate,
  type Projection,
} from "@/lib/engine";
import { type Goal, type Scenario, type Workspace } from "@/lib/model";
import { download, projectionCsv } from "@/lib/io";
import { Amount, Field, SectionTitle, currency, errorText } from "./shared";
import { LineChart } from "./projection-panel";

interface Estimates {
  signature: string;
  interestCapital: FundingEstimate;
  withdrawalCapital: FundingEstimate;
  monthlyFunding: FundingEstimate;
  lumpFunding: FundingEstimate;
  withdrawalDate: ReturnType<typeof earliestWithdrawal>;
}

export function FreedomPanel({
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
  const [draft, setDraft] = useState(scenario.goal);
  const [estimates, setEstimates] = useState<Estimates | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const interest = useMemo(() => evaluateIncome(scenario, projection), [scenario, projection]);
  const withdrawals = useMemo(
    () => (scenario.goal.enabled ? evaluateWithdrawals(scenario, projection) : null),
    [scenario, projection],
  );
  const latest = projection.rows.at(-1);
  const capacity = useMemo(
    () => (latest ? incomeCapacity(scenario, latest) : null),
    [scenario, latest],
  );
  const signature = JSON.stringify(scenario);
  const fresh = estimates?.signature === signature ? estimates : null;
  const set = <K extends keyof Goal>(key: K, value: Goal[K]) =>
    setDraft((old) => ({ ...old, [key]: value }));
  return (
    <>
      <SectionTitle eyebrow="FREEDOM, ON YOUR TERMS" title="Two strategies. One clear picture.">
        <span className="tag">Optional planning tools</span>
      </SectionTitle>
      <div className="notice">
        Interest is a return. A withdrawal is a reduction in assets. They are shown separately,
        never combined into one passive-income figure.
      </div>
      <section className="card">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            update({ ...scenario, goal: draft });
          }}
        >
          <label className="check goal-toggle">
            <input
              type="checkbox"
              checked={draft.enabled}
              onChange={(event) => set("enabled", event.target.checked)}
            />
            <strong>Enable financial freedom goals</strong>
          </label>
          <p className="muted">
            Leave this off to use the app as a standard investment projection calculator.
          </p>
          <div className="goal-grid">
            <fieldset>
              <legend>Strategy A · Net interest income</legend>
              <div className="form-grid">
                <Amount
                  label="Target monthly net interest"
                  value={draft.monthlyIncome}
                  onChange={(value) => set("monthlyIncome", value)}
                />
                <Amount
                  label="Target annual net interest"
                  value={draft.annualIncome}
                  onChange={(value) => set("annualIncome", value)}
                />
                <Amount
                  label="Target portfolio balance (optional)"
                  value={draft.portfolioTarget}
                  onChange={(value) => set("portfolioTarget", value)}
                />
                <Field label="Target achievement deadline (optional)">
                  <input
                    type="month"
                    value={draft.deadline}
                    onChange={(event) => set("deadline", event.target.value)}
                  />
                </Field>
              </div>
              <p className="footnote">
                Zero means unset. If several positive targets are entered, all must be met. Income
                capacity is evaluated from each month-end balance over the following 12 months with
                full payout and no further deposits, using scheduled rates and fees.
              </p>
            </fieldset>
            <fieldset>
              <legend>Strategy B · Sustainable withdrawals</legend>
              <div className="form-grid">
                <Amount
                  label="Target withdrawal amount"
                  value={draft.withdrawalAmount}
                  onChange={(value) => set("withdrawalAmount", value)}
                />
                <Field label="Withdrawal frequency">
                  <select
                    value={draft.withdrawalFrequency}
                    onChange={(event) =>
                      set("withdrawalFrequency", event.target.value as Goal["withdrawalFrequency"])
                    }
                  >
                    <option value="monthly">Monthly, at month-end</option>
                    <option value="annual">Annually, in start month</option>
                  </select>
                </Field>
                <Field label="Withdrawal start month">
                  <input
                    type="month"
                    required
                    value={draft.withdrawalStart}
                    onChange={(event) => set("withdrawalStart", event.target.value)}
                  />
                </Field>
                <Field label="Evaluation period (months)">
                  <input
                    type="number"
                    min="1"
                    max="600"
                    required
                    value={draft.evaluationMonths}
                    onChange={(event) => set("evaluationMonths", Number(event.target.value))}
                  />
                </Field>
                <Field label="Capital objective">
                  <select
                    value={draft.objective}
                    onChange={(event) => set("objective", event.target.value as Goal["objective"])}
                  >
                    <option value="nominal">Preserve nominal principal</option>
                    <option value="real">Preserve inflation-adjusted principal</option>
                    <option value="drawdown">Gradually draw down principal</option>
                  </select>
                </Field>
                <Amount
                  label="Minimum portfolio balance"
                  value={draft.minimumBalance}
                  onChange={(value) => set("minimumBalance", value)}
                />
              </div>
            </fieldset>
          </div>
          <div className="form-grid inflation-controls">
            <label className="check">
              <input
                type="checkbox"
                checked={draft.inflationEnabled}
                onChange={(event) => set("inflationEnabled", event.target.checked)}
              />
              Enable inflation
            </label>
            <Amount
              label="Annual inflation assumption (%)"
              value={draft.inflation}
              onChange={(value) => set("inflation", value)}
            />
          </div>
          <button type="submit" className="primary">
            Apply goal settings
          </button>
        </form>
      </section>
      {!scenario.goal.enabled ? (
        <section className="empty">
          <h3>Your projection works without a goal</h3>
          <p>
            Account balances, contributions, reinvestment, charts, and exports remain available.
          </p>
        </section>
      ) : (
        <>
          <div className="segmented strategy-tabs">
            <button
              aria-pressed={preferences.strategy === "interest"}
              onClick={() => setPreferences({ ...preferences, strategy: "interest" })}
            >
              A · Net interest income
            </button>
            <button
              aria-pressed={preferences.strategy === "withdrawal"}
              onClick={() => setPreferences({ ...preferences, strategy: "withdrawal" })}
            >
              B · Sustainable withdrawals
            </button>
          </div>
          {preferences.strategy === "interest" ? (
            <section className="card strategy-result">
              <p className="eyebrow">STRATEGY A · NET INTEREST INCOME</p>
              <h2>
                {interest.achieved
                  ? `Target capacity reached: ${interest.achieved.month}`
                  : interest.hasTarget
                    ? "Target not reached within the projection"
                    : "Set a positive income or balance target"}
              </h2>
              <p className="muted">
                Assessed at month-end; receiving cash begins only after an explicit
                payout/withdrawal change. Accumulation settings remain unchanged.
              </p>
              <div className="metric-grid">
                {[
                  [
                    "Portfolio at target / horizon",
                    interest.achieved?.assets ?? latest?.assets ?? "0",
                  ],
                  [
                    "External contributions",
                    interest.achieved?.cumulativeContributions ??
                      latest?.cumulativeContributions ??
                      "0",
                  ],
                  [
                    "Cumulative net interest earned",
                    interest.achieved?.cumulativeInterest ?? latest?.cumulativeInterest ?? "0",
                  ],
                  [
                    "Actual interest in that month",
                    interest.achieved?.interest ?? latest?.interest ?? "0",
                  ],
                  [
                    "Next-month net income capacity",
                    (interest.capacity ?? interest.lastCapacity ?? capacity)?.monthly ?? "0",
                  ],
                  [
                    "Forward 12-month net income",
                    (interest.capacity ?? interest.lastCapacity ?? capacity)?.annual ?? "0",
                  ],
                  ["Monthly target surplus / shortfall", interest.monthlyGap],
                  ["Annual target surplus / shortfall", interest.annualGap],
                ].map(([label, value]) => (
                  <div className="small-metric" key={label}>
                    <span>{label}</span>
                    <strong>{currency(value, scenario.currency)}</strong>
                  </div>
                ))}
              </div>
              {scenario.goal.deadline && (
                <p className={interest.deadlineMet ? "success" : "warning"}>
                  Deadline {scenario.goal.deadline}: {interest.deadlineMet ? "met" : "not met"}.
                </p>
              )}
              <p className="footnote">
                The forward-year amount is a 12-month engine projection, not one month multiplied by
                twelve. It assumes full interest payout on each configured credit date, no new
                external contributions, existing account balances, scheduled net rates, and separate
                fees. It is not guaranteed annual income.
              </p>
            </section>
          ) : (
            withdrawals && (
              <section className="card strategy-result">
                <p className="eyebrow">STRATEGY B · SUSTAINABLE WITHDRAWALS</p>
                <h2>
                  {Number(scenario.goal.withdrawalAmount) === 0
                    ? "Set a positive withdrawal amount"
                    : withdrawals.rows.length
                      ? withdrawals.objectiveMet
                        ? "Objective met under these assumptions"
                        : "This scenario does not meet its objective"
                      : "Extend or adjust the projection"}
                </h2>
                {withdrawals.reason && <p className="warning">{withdrawals.reason}</p>}
                <div className="metric-grid">
                  {[
                    ["Starting portfolio assets", withdrawals.startingBalance],
                    [
                      "Monthly withdrawal equivalent",
                      String(
                        Number(scenario.goal.withdrawalAmount) /
                          (scenario.goal.withdrawalFrequency === "annual" ? 12 : 1),
                      ),
                    ],
                    ["Remaining portfolio assets", withdrawals.rows.at(-1)?.row.assets ?? "0"],
                    [
                      "Total withdrawals",
                      withdrawals.rows.at(-1)?.row.cumulativeWithdrawals ?? "0",
                    ],
                    [
                      "External deposits during evaluation",
                      withdrawals.rows.at(-1)?.row.cumulativeContributions ?? "0",
                    ],
                    ["Final preservation shortfall", withdrawals.finalShortfall],
                  ].map(([label, value]) => (
                    <div className="small-metric" key={label}>
                      <span>{label}</span>
                      <strong>{currency(value, scenario.currency)}</strong>
                    </div>
                  ))}
                </div>
                <div className="result-dates">
                  <p>
                    Evaluation:{" "}
                    <strong>
                      {withdrawals.start} → {withdrawals.end}
                    </strong>
                  </p>
                  <p>
                    First preservation breach:{" "}
                    <strong>{withdrawals.firstObjectiveBreach ?? "None within horizon"}</strong>
                  </p>
                  <p>
                    First minimum-balance breach:{" "}
                    <strong>{withdrawals.firstMinimumBreach ?? "None within horizon"}</strong>
                  </p>
                  <p>
                    Depletion:{" "}
                    <strong>{withdrawals.depletion ?? "Not depleted within horizon"}</strong>
                  </p>
                </div>
                <button
                  disabled={!withdrawals.rows.length}
                  onClick={() =>
                    download(
                      "mmf-withdrawal-projection.csv",
                      projectionCsv(withdrawals.projection),
                      "text/csv;charset=utf-8",
                    )
                  }
                >
                  Export withdrawal projection CSV
                </button>
                <p className="footnote">
                  Withdrawals are made at month-end in account-list order, after credits and
                  existing dated transactions. This branch retains scheduled external deposits and
                  planned withdrawals but reinvests interest before explicit strategy withdrawals.
                  Account minimum restrictions apply. New deposits can support withdrawals; that is
                  not return-funded income. Preservation compares every month-end against starting
                  assets plus later opening capital; “stable” tolerance is 0.01 currency units.
                  Inflation is compounded monthly. A passing projection is not a safe-rate
                  guarantee.
                </p>
                {withdrawals.rows.length > 0 && (
                  <LineChart
                    title="Remaining principal under withdrawals"
                    labels={withdrawals.rows.map((item) => item.row.month)}
                    currencyCode={scenario.currency}
                    series={[
                      {
                        name: "Nominal assets",
                        values: withdrawals.rows.map((item) => Number(item.row.assets)),
                        color: "#315943",
                      },
                      {
                        name: "Nominal principal benchmark",
                        values: withdrawals.rows.map((item) => Number(item.nominalBenchmark)),
                        color: "#bd8a4f",
                      },
                      ...(scenario.goal.inflationEnabled
                        ? [
                            {
                              name: "Inflation-adjusted assets",
                              values: withdrawals.rows.map((item) => Number(item.realBalance)),
                              color: "#476b95",
                            },
                          ]
                        : []),
                    ]}
                  />
                )}
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Month</th>
                        <th>Opening</th>
                        <th>External deposits</th>
                        <th>Net interest</th>
                        <th>Withdrawals</th>
                        <th>Closing booked</th>
                        <th>Total assets</th>
                        <th>Withdrawals to date</th>
                        <th>Nominal principal</th>
                        <th>Real principal</th>
                        <th>Unfunded</th>
                      </tr>
                    </thead>
                    <tbody>
                      {withdrawals.rows.map((item) => (
                        <tr key={item.row.month}>
                          <th scope="row">{item.row.month}</th>
                          {[
                            item.row.opening,
                            item.row.contributions,
                            item.row.interest,
                            item.row.withdrawals,
                            item.row.closing,
                            item.row.assets,
                            item.row.cumulativeWithdrawals,
                          ].map((value, index) => (
                            <td key={index}>{currency(value, scenario.currency)}</td>
                          ))}
                          <td className={item.nominalTrend === "declining" ? "warning" : "success"}>
                            {item.nominalTrend}
                          </td>
                          <td>{item.realTrend ?? "Inflation off"}</td>
                          <td>{currency(item.row.shortfall, scenario.currency)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {withdrawals.projection.warnings.length > 0 && (
                  <details>
                    <summary>{withdrawals.projection.warnings.length} funding warnings</summary>
                    {withdrawals.projection.warnings.map((warning) => (
                      <p key={warning} className="warning">
                        {warning}
                      </p>
                    ))}
                  </details>
                )}
              </section>
            )
          )}
          <section className="card">
            <div className="section-title">
              <div>
                <h3>Compare the strategies</h3>
                <p className="muted">
                  Required capital and funding estimates run on demand; changing assumptions
                  invalidates them.
                </p>
              </div>
              <button
                disabled={busy || !scenario.accounts.length}
                onClick={() => {
                  setBusy(true);
                  setError("");
                  setTimeout(() => {
                    try {
                      setEstimates({
                        signature,
                        interestCapital: requiredPortfolio(scenario, "interest"),
                        withdrawalCapital: requiredPortfolio(scenario, "withdrawal"),
                        monthlyFunding: requiredFunding(scenario, "monthly"),
                        lumpFunding: requiredFunding(scenario, "lump"),
                        withdrawalDate:
                          Number(scenario.goal.withdrawalAmount) > 0
                            ? earliestWithdrawal(scenario, projection)
                            : { month: null, contributions: null },
                      });
                    } catch (caught) {
                      setError(errorText(caught));
                    } finally {
                      setBusy(false);
                    }
                  }, 30);
                }}
              >
                {busy ? "Calculating..." : "Calculate decision estimates"}
              </button>
            </div>
            <div className="table-wrap">
              <table className="comparison-table">
                <thead>
                  <tr>
                    <th>Measure</th>
                    <th>A · Net interest income</th>
                    <th>B · Sustainable withdrawals</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <th>Monthly target</th>
                    <td>
                      {currency(scenario.goal.monthlyIncome, scenario.currency)}
                      {Number(scenario.goal.annualIncome) > 0 &&
                        ` + annual target ${currency(scenario.goal.annualIncome, scenario.currency)}`}
                    </td>
                    <td>
                      {currency(
                        Number(scenario.goal.withdrawalAmount) /
                          (scenario.goal.withdrawalFrequency === "annual" ? 12 : 1),
                        scenario.currency,
                      )}{" "}
                      withdrawn
                    </td>
                  </tr>
                  <tr>
                    <th>Projected monthly amount</th>
                    <td>
                      {currency(
                        (interest.capacity ?? interest.lastCapacity ?? capacity)?.monthly ?? 0,
                        scenario.currency,
                      )}{" "}
                      next-month income capacity
                    </td>
                    <td>
                      {currency(withdrawals?.rows[0]?.row.withdrawals ?? 0, scenario.currency)}{" "}
                      first-month actual withdrawal
                    </td>
                  </tr>
                  <tr>
                    <th>Required portfolio balance</th>
                    <td>
                      {fresh?.interestCapital.amount !== null &&
                      fresh?.interestCapital.amount !== undefined
                        ? currency(fresh.interestCapital.amount, scenario.currency)
                        : "Calculate / not calculable"}
                    </td>
                    <td>
                      {fresh?.withdrawalCapital.amount !== null &&
                      fresh?.withdrawalCapital.amount !== undefined
                        ? currency(fresh.withdrawalCapital.amount, scenario.currency)
                        : "Calculate / not calculable"}
                    </td>
                  </tr>
                  <tr>
                    <th>Financial freedom date</th>
                    <td>{interest.achieved?.month ?? "Not reached within horizon"}</td>
                    <td>
                      {fresh?.withdrawalDate.month ?? "Calculate / not reached within horizon"}
                    </td>
                  </tr>
                  <tr>
                    <th>External contributions to target</th>
                    <td>
                      {interest.achieved
                        ? currency(interest.achieved.cumulativeContributions, scenario.currency)
                        : "Target not reached"}
                    </td>
                    <td>
                      {fresh?.withdrawalDate.contributions
                        ? currency(fresh.withdrawalDate.contributions, scenario.currency)
                        : "Calculate / target not reached"}
                    </td>
                  </tr>
                  <tr>
                    <th>Remaining principal</th>
                    <td>Accumulation assets: {currency(latest?.assets ?? 0, scenario.currency)}</td>
                    <td>
                      After evaluation:{" "}
                      {currency(withdrawals?.rows.at(-1)?.row.assets ?? 0, scenario.currency)}
                    </td>
                  </tr>
                  <tr>
                    <th>Inflation treatment</th>
                    <td>Income targets are nominal; compare purchasing power separately.</td>
                    <td>
                      {scenario.goal.inflationEnabled
                        ? `${scenario.goal.inflation}% annual inflation`
                        : "Inflation disabled"}{" "}
                      · {scenario.goal.objective} objective
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            {fresh && (
              <div className="estimate-details">
                {[
                  ["Required interest portfolio", fresh.interestCapital],
                  ["Required withdrawal portfolio", fresh.withdrawalCapital],
                  ["Additional monthly contribution by deadline", fresh.monthlyFunding],
                  ["Additional lump sum by deadline", fresh.lumpFunding],
                ].map(([label, value]) => {
                  const estimate = value as FundingEstimate;
                  return (
                    <p key={String(label)}>
                      <strong>
                        {String(label)}:{" "}
                        {estimate.amount === null
                          ? "Not calculable"
                          : currency(estimate.amount, scenario.currency)}
                      </strong>
                      <br />
                      <span className="muted">{estimate.reason}</span>
                    </p>
                  );
                })}
              </div>
            )}
            {error && (
              <p role="alert" className="error">
                {error}
              </p>
            )}
            <p className="footnote">
              The earliest withdrawal financial freedom date excludes external deposits after the
              candidate start date. Required capital is conditional on the selected horizon, account
              allocation, net rates, fees, inflation, withdrawal timing, and preservation objective.
              Nominal preservation alone does not preserve purchasing power. Use saved scenarios to
              compare different rates and inflation assumptions.
            </p>
          </section>
        </>
      )}
    </>
  );
}
