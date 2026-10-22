"use client";

import { useMemo, useState } from "react";
import Decimal from "decimal.js";
import { duplicateScenario, newScenario, type Scenario, type Workspace } from "@/lib/model";
import { evaluateIncome, incomeCapacity, project } from "@/lib/engine";
import { Field, SectionTitle, currency } from "./shared";
import { LineChart } from "./projection-panel";

export function ScenarioPanel({
  workspace,
  commit,
}: {
  workspace: Workspace;
  commit: (workspace: Workspace) => boolean;
}) {
  const scenario = workspace.scenarios.find((item) => item.id === workspace.activeId)!;
  const [name, setName] = useState(`${scenario.name} copy`);
  const [delta, setDelta] = useState("2");
  const [effective, setEffective] = useState(`${scenario.start}-01`);
  const results = useMemo(
    () =>
      workspace.scenarios.map((item) => {
        const projection = project(item);
        const latest = projection.rows.at(-1)!;
        return {
          scenario: item,
          projection,
          latest,
          capacity: incomeCapacity(item, latest),
          goal: evaluateIncome(item, projection),
        };
      }),
    [workspace.scenarios],
  );
  const sameCurrency = results.every((item) => item.scenario.currency === scenario.currency);
  const commonMonths = results
    .find((item) => item.scenario.id === scenario.id)!
    .projection.rows.filter((row) =>
      results.every((result) => result.projection.rows.some((item) => item.month === row.month)),
    )
    .map((row) => row.month);
  const duplicates = (items: Scenario[]) =>
    commit({ ...workspace, scenarios: [...workspace.scenarios, ...items] });
  const sensitivity = (change: number, suffix: string): Scenario => {
    const copy = duplicateScenario(scenario, `${scenario.name} · ${suffix}`);
    copy.accounts = copy.accounts.map((account) => {
      const sorted = [...account.rates].sort((a, b) =>
        a.effectiveDate.localeCompare(b.effectiveDate),
      );
      const current = sorted.findLast((rate) => rate.effectiveDate <= effective) ?? sorted[0];
      const rates = sorted.map((rate) =>
        rate.effectiveDate >= effective
          ? {
              ...rate,
              annualNetRate: Decimal.max(
                0,
                Decimal.min(100, new Decimal(rate.annualNetRate).plus(change)),
              ).toString(),
            }
          : rate,
      );
      if (!rates.some((rate) => rate.effectiveDate === effective))
        rates.push({
          ...current,
          effectiveDate: effective,
          annualNetRate: Decimal.max(
            0,
            Decimal.min(100, new Decimal(current.annualNetRate).plus(change)),
          ).toString(),
        });
      return { ...account, rates };
    });
    return copy;
  };
  return (
    <>
      <SectionTitle
        eyebrow="EXPLORE THE POSSIBILITIES"
        title="Different assumptions. Separate plans."
      >
        <button
          onClick={() => {
            const fresh = newScenario();
            commit({
              ...workspace,
              activeId: fresh.id,
              scenarios: [...workspace.scenarios, fresh],
            });
          }}
        >
          + Empty scenario
        </button>
      </SectionTitle>
      <div className="two-column">
        <section className="card">
          <h3>Duplicate your current plan</h3>
          <p className="muted">
            Copies accounts, transactions, goals, and baseline data. Future edits remain
            independent.
          </p>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const copy = duplicateScenario(scenario, name);
              commit({
                ...workspace,
                activeId: copy.id,
                scenarios: [...workspace.scenarios, copy],
              });
            }}
          >
            <Field label="New scenario name">
              <input
                required
                maxLength={100}
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </Field>
            <button type="submit" className="primary">
              Duplicate scenario
            </button>
          </form>
        </section>
        <section className="card">
          <h3>Rate sensitivity</h3>
          <p className="muted">
            Create lower, unchanged, and higher net-return scenarios. Original rates and earlier
            accrual remain untouched.
          </p>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              duplicates([
                sensitivity(-Number(delta), "Lower returns"),
                sensitivity(0, "Expected returns"),
                sensitivity(Number(delta), "Higher returns"),
              ]);
            }}
          >
            <div className="form-grid">
              <Field label="Change (percentage points)">
                <input
                  required
                  type="number"
                  min="0"
                  max="100"
                  step="any"
                  value={delta}
                  onChange={(event) => setDelta(event.target.value)}
                />
              </Field>
              <Field label="Effective from">
                <input
                  required
                  type="date"
                  min={`${scenario.start}-01`}
                  value={effective}
                  onChange={(event) => setEffective(event.target.value)}
                />
              </Field>
            </div>
            <button type="submit">Create three sensitivity scenarios</button>
          </form>
        </section>
      </div>
      <section className="card">
        <h3>Compare saved scenarios</h3>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Scenario</th>
                <th>Horizon</th>
                <th>Closing assets</th>
                <th>External contributions</th>
                <th>Cumulative net interest</th>
                <th>Next-month income capacity</th>
                <th>Forward-year income capacity</th>
                <th>Interest target date</th>
                <th>Value difference vs current</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {results.map((result) => {
                const base = results.find((item) => item.scenario.id === scenario.id)!;
                return (
                  <tr key={result.scenario.id}>
                    <th>
                      <input
                        aria-label={`Rename ${result.scenario.name}`}
                        defaultValue={result.scenario.name}
                        onBlur={(event) => {
                          if (event.target.value !== result.scenario.name)
                            commit({
                              ...workspace,
                              scenarios: workspace.scenarios.map((item) =>
                                item.id === result.scenario.id
                                  ? { ...item, name: event.target.value }
                                  : item,
                              ),
                            });
                        }}
                      />
                    </th>
                    <td>
                      {result.scenario.start} → {result.scenario.end}
                    </td>
                    {[
                      result.latest.assets,
                      result.latest.cumulativeContributions,
                      result.latest.cumulativeInterest,
                      result.capacity.monthly,
                      result.capacity.annual,
                    ].map((value, index) => (
                      <td key={index}>{currency(value, result.scenario.currency)}</td>
                    ))}
                    <td>
                      {result.goal.hasTarget
                        ? (result.goal.achieved?.month ?? "Not reached")
                        : "No target"}
                    </td>
                    <td>
                      {result.scenario.currency === base.scenario.currency &&
                      result.scenario.end === base.scenario.end
                        ? currency(
                            new Decimal(result.latest.assets).minus(base.latest.assets).toString(),
                            scenario.currency,
                          )
                        : "Different currency / horizon"}
                    </td>
                    <td>
                      <div className="actions">
                        <button
                          disabled={result.scenario.id === workspace.activeId}
                          onClick={() => commit({ ...workspace, activeId: result.scenario.id })}
                        >
                          {result.scenario.id === workspace.activeId ? "Current" : "Open"}
                        </button>
                        <button
                          className="danger-text"
                          disabled={workspace.scenarios.length === 1}
                          onClick={() => {
                            if (
                              !window.confirm(
                                `Delete scenario "${result.scenario.name}"? Export a backup first if needed.`,
                              )
                            )
                              return;
                            const remaining = workspace.scenarios.filter(
                              (item) => item.id !== result.scenario.id,
                            );
                            commit({
                              ...workspace,
                              scenarios: remaining,
                              activeId:
                                result.scenario.id === workspace.activeId
                                  ? remaining[0].id
                                  : workspace.activeId,
                            });
                          }}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
      {sameCurrency && commonMonths.length ? (
        <LineChart
          title="Portfolio assets by scenario · shared months only"
          currencyCode={scenario.currency}
          labels={commonMonths}
          series={results.map((result, index) => ({
            name: result.scenario.name,
            color: ["#315943", "#bd8a4f", "#476b95", "#986e95", "#7d8350"][index % 5],
            values: commonMonths.map((month) =>
              Number(result.projection.rows.find((item) => item.month === month)!.assets),
            ),
          }))}
        />
      ) : (
        <p className="warning">
          Charts require a shared projection window and currency. No exchange rates or zero balances
          for missing months are assumed.
        </p>
      )}
      <p className="footnote">
        Up to 20 scenarios. Rate sensitivity is an assumption comparison, not a forecast or
        guarantee. Compare inflation and preservation objectives in each scenario&apos;s Financial
        freedom view.
      </p>
    </>
  );
}
