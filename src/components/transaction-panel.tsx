"use client";

import { useState } from "react";
import { newId, type Scenario, type Schedule, type Transaction } from "@/lib/model";
import { AccountSelect, Amount, Dialog, Empty, Field, SectionTitle, currency } from "./shared";

export function TransactionPanel({
  scenario,
  update,
}: {
  scenario: Scenario;
  update: (scenario: Scenario) => boolean;
}) {
  const [kind, setKind] = useState<"once" | "recurring">("once");
  const [editing, setEditing] = useState<Transaction | Schedule | null>(null);
  const newEntry = () => {
    const base = {
      id: newId(),
      accountId: scenario.accounts[0]?.id ?? "",
      destinationId: "",
      type: "deposit" as const,
      amount: "0",
      timing: "start" as const,
    };
    setEditing(
      kind === "once"
        ? { ...base, date: `${scenario.start}-01`, note: "" }
        : { ...base, start: scenario.start, end: scenario.end, day: 1, paused: false },
    );
  };
  return (
    <>
      <SectionTitle eyebrow="MONEY IN MOTION" title="Build your contribution rhythm">
        <div className="actions">
          <select
            aria-label="Transaction frequency"
            value={kind}
            onChange={(event) => setKind(event.target.value as typeof kind)}
          >
            <option value="once">One-off transaction</option>
            <option value="recurring">Monthly schedule</option>
          </select>
          <button className="primary" disabled={!scenario.accounts.length} onClick={newEntry}>
            + Add transaction
          </button>
        </div>
      </SectionTitle>
      <div className="notice">
        External deposits grow your invested capital. Transfers move existing assets. Withdrawals
        reduce assets; they are never counted as returns.
      </div>
      {!scenario.accounts.length && (
        <Empty title="Add an account first">
          Each transaction needs an account. Opening capital is configured in account settings.
        </Empty>
      )}
      <h3>Recurring schedules</h3>
      {!scenario.schedules.length ? (
        <p className="muted">
          No recurring schedules. Add a fixed deposit, withdrawal, or transfer and choose its final
          month.
        </p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Type / account</th>
                <th>Amount</th>
                <th>From → through</th>
                <th>Day</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {scenario.schedules.map((item) => (
                <tr key={item.id}>
                  <td>
                    {item.type} ·{" "}
                    {scenario.accounts.find((account) => account.id === item.accountId)?.name}
                    {item.type === "transfer" &&
                      ` → ${scenario.accounts.find((account) => account.id === item.destinationId)?.name}`}
                  </td>
                  <td>{currency(item.amount, scenario.currency)}</td>
                  <td>
                    {item.start} → {item.end}
                  </td>
                  <td>
                    {item.day} ({item.timing})
                  </td>
                  <td>{item.paused ? "Paused" : "Active"}</td>
                  <td>
                    <div className="actions">
                      <button onClick={() => setEditing(structuredClone(item))}>Edit</button>
                      <button
                        onClick={() =>
                          update({
                            ...scenario,
                            schedules: scenario.schedules.map((schedule) =>
                              schedule.id === item.id
                                ? { ...schedule, paused: !schedule.paused }
                                : schedule,
                            ),
                          })
                        }
                      >
                        {item.paused ? "Resume" : "Pause"}
                      </button>
                      <button
                        className="danger-text"
                        onClick={() => {
                          if (
                            window.confirm(
                              "Remove this planned schedule? Historical baseline figures will not change.",
                            )
                          )
                            update({
                              ...scenario,
                              schedules: scenario.schedules.filter(
                                (schedule) => schedule.id !== item.id,
                              ),
                            });
                        }}
                      >
                        Remove
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <h3>One-off transactions</h3>
      {!scenario.transactions.length ? (
        <p className="muted">
          No one-off transactions. Add lump sums, irregular deposits, transfers, or withdrawals on
          their actual dates.
        </p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Type</th>
                <th>Account</th>
                <th>Amount</th>
                <th>Note</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {[...scenario.transactions]
                .sort((a, b) => a.date.localeCompare(b.date))
                .map((item) => (
                  <tr key={item.id}>
                    <td>
                      {item.date} ({item.timing})
                    </td>
                    <td>{item.type}</td>
                    <td>
                      {scenario.accounts.find((account) => account.id === item.accountId)?.name}
                      {item.type === "transfer" &&
                        ` → ${scenario.accounts.find((account) => account.id === item.destinationId)?.name}`}
                    </td>
                    <td>{currency(item.amount, scenario.currency)}</td>
                    <td>{item.note}</td>
                    <td>
                      <div className="actions">
                        <button onClick={() => setEditing(structuredClone(item))}>Edit</button>
                        <button
                          className="danger-text"
                          onClick={() => {
                            if (window.confirm("Remove this planned transaction?"))
                              update({
                                ...scenario,
                                transactions: scenario.transactions.filter(
                                  (transaction) => transaction.id !== item.id,
                                ),
                              });
                          }}
                        >
                          Remove
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}
      {!!scenario.contributionOverrides.length && (
        <section className="card">
          <h3>Monthly table deposit overrides</h3>
          <p className="muted">
            These replace all other external deposits for the selected account/month, without
            deleting the original schedules or transactions.
          </p>
          {scenario.contributionOverrides.map((item) => (
            <div className="override-line" key={`${item.accountId}:${item.month}`}>
              <span>
                {item.month} ·{" "}
                {scenario.accounts.find((account) => account.id === item.accountId)?.name} ·{" "}
                {currency(item.amount, scenario.currency)} · day {item.day} ({item.timing})
              </span>
              <button
                onClick={() =>
                  update({
                    ...scenario,
                    contributionOverrides: scenario.contributionOverrides.filter(
                      (entry) => entry !== item,
                    ),
                  })
                }
              >
                Reset to schedules
              </button>
            </div>
          ))}
        </section>
      )}
      {editing && (
        <TransactionEditor
          key={editing.id}
          entry={editing}
          scenario={scenario}
          onClose={() => setEditing(null)}
          onSave={(entry) => {
            const saved =
              "date" in entry
                ? update({
                    ...scenario,
                    transactions: [
                      ...scenario.transactions.filter((item) => item.id !== entry.id),
                      entry,
                    ],
                  })
                : update({
                    ...scenario,
                    schedules: [
                      ...scenario.schedules.filter((item) => item.id !== entry.id),
                      entry,
                    ],
                  });
            if (saved) setEditing(null);
            return saved;
          }}
        />
      )}
    </>
  );
}

function TransactionEditor({
  entry,
  scenario,
  onClose,
  onSave,
}: {
  entry: Transaction | Schedule;
  scenario: Scenario;
  onClose: () => void;
  onSave: (entry: Transaction | Schedule) => boolean;
}) {
  const [draft, setDraft] = useState(entry);
  const [error, setError] = useState("");
  const patch = (values: Partial<Transaction & Schedule>) =>
    setDraft((old) => ({ ...old, ...values }));
  return (
    <Dialog label="Transaction editor" onClose={onClose} narrow>
      <div className="section-title">
        <h2>{"date" in draft ? "One-off transaction" : "Monthly schedule"}</h2>
        <button onClick={onClose}>Close</button>
      </div>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (!onSave(draft))
            setError(
              "Not saved. Check the workspace validation or storage error; your form values are retained.",
            );
        }}
      >
        <div className="form-grid">
          <Field label="Transaction type">
            <select
              value={draft.type}
              onChange={(event) => patch({ type: event.target.value as Transaction["type"] })}
            >
              <option value="deposit">External deposit</option>
              <option value="withdrawal">Withdrawal</option>
              <option value="transfer">Internal transfer</option>
            </select>
          </Field>
          <AccountSelect
            scenario={scenario}
            value={draft.accountId}
            onChange={(value) => patch({ accountId: value })}
          />
          {draft.type === "transfer" && (
            <AccountSelect
              label="Destination account"
              scenario={scenario}
              value={draft.destinationId}
              onChange={(value) => patch({ destinationId: value })}
            />
          )}
          <Amount
            label={`Amount (${scenario.currency})`}
            value={draft.amount}
            onChange={(value) => patch({ amount: value })}
          />
          <Field label="Transaction timing">
            <select
              value={draft.timing}
              onChange={(event) => patch({ timing: event.target.value as Transaction["timing"] })}
            >
              <option value="start">Start of day (before accrual)</option>
              <option value="end">End of day (after accrual / credits)</option>
            </select>
          </Field>
          {"date" in draft ? (
            <>
              <Field label="Transaction date">
                <input
                  type="date"
                  required
                  value={draft.date}
                  onChange={(event) => patch({ date: event.target.value })}
                />
              </Field>
              <Field label="Note">
                <input
                  value={draft.note}
                  onChange={(event) => patch({ note: event.target.value })}
                />
              </Field>
            </>
          ) : (
            <>
              <Field label="First month">
                <input
                  type="month"
                  required
                  value={draft.start}
                  onChange={(event) => patch({ start: event.target.value })}
                />
              </Field>
              <Field label="Final month (inclusive)">
                <input
                  type="month"
                  required
                  value={draft.end}
                  onChange={(event) => patch({ end: event.target.value })}
                />
              </Field>
              <Field label="Day of month" hint="Days beyond month-end use its last day.">
                <input
                  type="number"
                  min="1"
                  max="31"
                  required
                  value={draft.day}
                  onChange={(event) => patch({ day: Number(event.target.value) })}
                />
              </Field>
              <label className="check">
                <input
                  type="checkbox"
                  checked={draft.paused}
                  onChange={(event) => patch({ paused: event.target.checked })}
                />
                Paused
              </label>
            </>
          )}
        </div>
        <div className="notice">
          To change contributions from a chosen month, end the old schedule before that month and
          add a new one. For individual months, use a table deposit override.
        </div>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        <div className="actions modal-actions">
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="primary" type="submit">
            Save transaction
          </button>
        </div>
      </form>
    </Dialog>
  );
}
