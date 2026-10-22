"use client";

import { useState } from "react";
import { accountSchema, newAccount, type Account, type Scenario } from "@/lib/model";
import { convertGrossToNet, monthlyRate } from "@/lib/engine";
import { Amount, Dialog, Empty, Field, SectionTitle, currency, errorText } from "./shared";

export function AccountPanel({
  scenario,
  update,
}: {
  scenario: Scenario;
  update: (scenario: Scenario) => boolean;
}) {
  const [editing, setEditing] = useState<Account | null>(null);
  const remove = (account: Account) => {
    if (!window.confirm(`Delete the empty, unreferenced account "${account.name}"?`)) return;
    update({ ...scenario, accounts: scenario.accounts.filter((item) => item.id !== account.id) });
  };
  return (
    <>
      <SectionTitle eyebrow="YOUR INVESTMENTS" title="A place for every account">
        <button
          className="primary"
          onClick={() => setEditing(newAccount(scenario.start, scenario.currency))}
        >
          + Add account
        </button>
      </SectionTitle>
      <div className="notice">
        Annual net interest after tax. Full reinvestment by default. No tax is deducted again.
      </div>
      {!scenario.accounts.length && (
        <Empty title="Start with your real assumptions">
          Add an account, its opening balance, and its annual net rate. No market rate or opening
          capital has been assumed.
        </Empty>
      )}
      <div className="account-grid">
        {scenario.accounts.map((account, index) => {
          const rate = [...account.rates].sort((a, b) =>
            a.effectiveDate.localeCompare(b.effectiveDate),
          )[0];
          const referenced =
            scenario.transactions.some(
              (item) => item.accountId === account.id || item.destinationId === account.id,
            ) ||
            scenario.schedules.some(
              (item) => item.accountId === account.id || item.destinationId === account.id,
            ) ||
            scenario.contributionOverrides.some((item) => item.accountId === account.id);
          return (
            <article className="card account-card" key={account.id}>
              <div className="card-top">
                <span className={`account-dot color-${index % 5}`} />{" "}
                <span className="tag">{account.category}</span>
                <span className="muted push-right">{account.status}</span>
              </div>
              <h3>{account.name}</h3>
              <p className="muted">
                {account.provider || "Independent account"} · {account.currency}
              </p>
              <div className="account-rate">
                {rate.annualNetRate}
                <small>% initial annual net</small>
              </div>
              <p className="muted">
                {rate.quotation} · effective {rate.effectiveDate}
                {account.rates.length > 1 ? ` · ${account.rates.length - 1} scheduled changes` : ""}
              </p>
              <dl className="mini-details">
                <div>
                  <dt>Opening capital</dt>
                  <dd>{currency(account.openingBalance, account.currency)}</dd>
                </div>
                <div>
                  <dt>Interest handling</dt>
                  <dd>
                    {Number(account.payoutPercent) === 0
                      ? "Fully reinvested"
                      : `${account.payoutPercent}% paid out`}
                  </dd>
                </div>
                <div>
                  <dt>Accrual / crediting</dt>
                  <dd>
                    {account.accrual} / {account.crediting}
                  </dd>
                </div>
              </dl>
              <div className="actions">
                <button onClick={() => setEditing(structuredClone(account))}>Edit account</button>
                {!referenced && Number(account.openingBalance) === 0 && (
                  <button className="danger-text" onClick={() => remove(account)}>
                    Delete
                  </button>
                )}
              </div>
            </article>
          );
        })}
      </div>
      {editing && (
        <AccountEditor
          key={editing.id}
          account={editing}
          onClose={() => setEditing(null)}
          onSave={(account) => {
            const exists = scenario.accounts.some((item) => item.id === account.id);
            if (
              update({
                ...scenario,
                accounts: exists
                  ? scenario.accounts.map((item) => (item.id === account.id ? account : item))
                  : [...scenario.accounts, account],
              })
            ) {
              setEditing(null);
              return true;
            }
            return false;
          }}
        />
      )}
      <p className="footnote">
        Inactive and archived accounts retain balances and historical records; their recurring
        schedules pause. Rename freely. Archive funded or referenced accounts instead of deleting
        them.
      </p>
    </>
  );
}

function AccountEditor({
  account,
  onSave,
  onClose,
}: {
  account: Account;
  onSave: (account: Account) => boolean;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(account);
  const [error, setError] = useState("");
  const set = <K extends keyof Account>(key: K, value: Account[K]) =>
    setDraft((old) => ({ ...old, [key]: value }));
  return (
    <Dialog label="Account settings" onClose={onClose}>
      <div className="section-title">
        <div>
          <p className="eyebrow">ACCOUNT SETTINGS</p>
          <h2>{account.name}</h2>
        </div>
        <button aria-label="Close account settings" onClick={onClose}>
          Close
        </button>
      </div>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          try {
            if (!onSave(accountSchema.parse(draft)))
              setError(
                "Not saved. Check the workspace validation or storage error; your form values are retained.",
              );
          } catch (caught) {
            setError(errorText(caught));
          }
        }}
      >
        <div className="notice">
          Rate convention: <strong>annual net after tax</strong>. Interest handling:{" "}
          <strong>
            {Number(draft.payoutPercent) === 0
              ? "full reinvestment"
              : "explicit partial/full payout"}
          </strong>
          .
        </div>
        <div className="form-grid">
          <Field label="Account name">
            <input
              required
              value={draft.name}
              onChange={(event) => set("name", event.target.value)}
            />
          </Field>
          <Field label="Provider (optional)">
            <input
              value={draft.provider}
              onChange={(event) => set("provider", event.target.value)}
            />
          </Field>
          <Field label="Category">
            <select
              value={draft.category}
              onChange={(event) => set("category", event.target.value as Account["category"])}
            >
              {["MMF", "Fixed income", "Savings", "Custom"].map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </Field>
          <Field label="Status">
            <select
              value={draft.status}
              onChange={(event) => set("status", event.target.value as Account["status"])}
            >
              {["active", "inactive", "archived"].map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </Field>
          <Amount
            label={`Opening principal (${draft.currency})`}
            value={draft.openingBalance}
            onChange={(value) => set("openingBalance", value)}
          />
          <Field
            label="Opening date"
            hint="Earlier than projection start: the entered balance is the balance at projection start."
          >
            <input
              type="date"
              required
              value={draft.openingDate}
              onChange={(event) => set("openingDate", event.target.value)}
            />
          </Field>
          <Field label="Accrual & compounding">
            <select
              value={draft.accrual}
              onChange={(event) => set("accrual", event.target.value as Account["accrual"])}
            >
              <option value="monthly">Monthly compound / actual-month proration</option>
              <option value="daily-accrual">Daily accrual / compound on credit</option>
              <option value="daily-compound">Daily compounding / Actual-Actual</option>
              <option value="simple">Simple interest / no compounding</option>
            </select>
          </Field>
          <Field label="Interest crediting frequency">
            <select
              value={draft.crediting}
              onChange={(event) => set("crediting", event.target.value as Account["crediting"])}
            >
              <option value="monthly">Monthly</option>
              <option value="quarterly">Calendar quarter-end</option>
              <option value="annually">Calendar year-end</option>
            </select>
          </Field>
          <Amount
            label="Interest paid out (%)"
            hint="0 = full reinvestment. Payouts are explicit asset withdrawals."
            value={draft.payoutPercent}
            onChange={(value) => set("payoutPercent", value)}
          />
          <Amount
            label="Separate monthly fee"
            hint="Only fees NOT already included in the quoted net return."
            value={draft.monthlyFee}
            onChange={(value) => set("monthlyFee", value)}
          />
          <Amount
            label="Restricted minimum account balance"
            hint="Transactions cannot withdraw this retained balance."
            value={draft.minimumBalance}
            onChange={(value) => set("minimumBalance", value)}
          />
        </div>
        <h3>Annual net rates & effective dates</h3>
        <p className="muted">
          Rate changes affect only accrual from their effective date. Monthly compounding uses the
          annual quotation convention you choose.
        </p>
        {draft.rates.map((rate, index) => {
          const change = (patch: Partial<typeof rate>) =>
            set(
              "rates",
              draft.rates.map((item, position) =>
                position === index ? { ...item, ...patch } : item,
              ),
            );
          let converted = "Enter a valid rate";
          try {
            converted = `${(Number(monthlyRate(rate)) * 100).toFixed(6)}% equivalent monthly`;
          } catch {
            /* Incomplete form input is not a calculation assumption. */
          }
          let reconciliation = "";
          try {
            if (rate.grossRate !== undefined && rate.taxRate !== undefined) {
              const referenceNet = convertGrossToNet(rate.grossRate, rate.taxRate);
              reconciliation = `Reference gross × (1 − tax) = ${referenceNet}% net. ${Math.abs(Number(referenceNet) - Number(rate.annualNetRate)) > 0.000001 ? "This differs from the entered net rate, which remains authoritative. Check quotation conventions." : "The entered net rate is unchanged."}`;
            }
          } catch {
            /* Reference fields may be incomplete while editing. */
          }
          return (
            <fieldset key={index} className="rate-row">
              <legend>Rate {index + 1}</legend>
              <div className="form-grid">
                <Field label="Rate effective date">
                  <input
                    type="date"
                    required
                    value={rate.effectiveDate}
                    onChange={(event) => change({ effectiveDate: event.target.value })}
                  />
                </Field>
                <Amount
                  label="Annual net rate after tax (%)"
                  value={rate.annualNetRate}
                  onChange={(value) => change({ annualNetRate: value })}
                  hint={converted}
                />
                <Field label="Annual quotation">
                  <select
                    value={rate.quotation}
                    onChange={(event) =>
                      change({ quotation: event.target.value as typeof rate.quotation })
                    }
                  >
                    <option value="effective">Effective annual</option>
                    <option value="nominal">Nominal annual</option>
                  </select>
                </Field>
                <Field label="Gross annual rate (reference only)">
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="any"
                    value={rate.grossRate ?? ""}
                    onChange={(event) => change({ grossRate: event.target.value || undefined })}
                  />
                </Field>
                <Field label="Interest tax (%) (reference only)">
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="any"
                    value={rate.taxRate ?? ""}
                    onChange={(event) => change({ taxRate: event.target.value || undefined })}
                  />
                </Field>
              </div>
              {reconciliation && <p className="warning">{reconciliation}</p>}
              <div className="actions">
                {rate.grossRate !== undefined && rate.taxRate !== undefined && (
                  <button
                    type="button"
                    onClick={() => {
                      if (
                        window.confirm(
                          "Explicitly replace the entered net rate with gross × (1 − tax)? This is a reference conversion; verify provider terms and compounding treatment.",
                        )
                      )
                        change({
                          annualNetRate: convertGrossToNet(rate.grossRate!, rate.taxRate!),
                        });
                    }}
                  >
                    Explicitly convert gross → net
                  </button>
                )}
                {draft.rates.length > 1 && (
                  <button
                    type="button"
                    className="danger-text"
                    onClick={() =>
                      set(
                        "rates",
                        draft.rates.filter((_, position) => position !== index),
                      )
                    }
                  >
                    Remove rate
                  </button>
                )}
              </div>
            </fieldset>
          );
        })}
        <button
          type="button"
          onClick={() =>
            set("rates", [
              ...draft.rates,
              { effectiveDate: "", annualNetRate: "0", quotation: "effective" },
            ])
          }
        >
          + Schedule rate change
        </button>
        <h3>Scheduled fee changes</h3>
        <p className="muted">
          Separate monthly fees use the amount effective on their month-end charging date. Earlier
          charges are unchanged.
        </p>
        {draft.feeChanges.map((fee, index) => (
          <fieldset className="rate-row" key={index}>
            <legend>Fee change {index + 1}</legend>
            <div className="form-grid">
              <Field label="Fee effective date">
                <input
                  required
                  type="date"
                  value={fee.effectiveDate}
                  onChange={(event) =>
                    set(
                      "feeChanges",
                      draft.feeChanges.map((item, position) =>
                        position === index ? { ...item, effectiveDate: event.target.value } : item,
                      ),
                    )
                  }
                />
              </Field>
              <Amount
                label="New separate monthly fee"
                value={fee.monthlyFee}
                onChange={(value) =>
                  set(
                    "feeChanges",
                    draft.feeChanges.map((item, position) =>
                      position === index ? { ...item, monthlyFee: value } : item,
                    ),
                  )
                }
              />
            </div>
            <button
              type="button"
              className="danger-text"
              onClick={() =>
                set(
                  "feeChanges",
                  draft.feeChanges.filter((_, position) => position !== index),
                )
              }
            >
              Remove fee change
            </button>
          </fieldset>
        ))}
        <button
          type="button"
          onClick={() =>
            set("feeChanges", [...draft.feeChanges, { effectiveDate: "", monthlyFee: "0" }])
          }
        >
          + Schedule fee change
        </button>
        <Field label="Notes, source, and provider assumptions">
          <textarea value={draft.notes} onChange={(event) => set("notes", event.target.value)} />
        </Field>
        <p className="footnote">
          Daily accrual uses Actual/Actual for nominal rates; effective rates are converted to the
          crediting period and prorated by its calendar days. Simple interest uses the entered
          annual percentage without compounding. Confirm these conventions against provider terms.
        </p>
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
            Save account
          </button>
        </div>
      </form>
    </Dialog>
  );
}
