import Decimal from "decimal.js";
import { addDays, addMonths, monthDays, monthEnd, months, periodDays, yearDays } from "./dates";
import { scenarioSchema, type Account, type Rate, type Scenario, type Transaction } from "./model";

const D = Decimal.clone({ precision: 32, rounding: Decimal.ROUND_HALF_EVEN });
const zero = () => new D(0);
export const sum = (values: string[]) =>
  values.reduce((total, value) => total.plus(value), zero()).toString();
export const money = (value: Decimal.Value) => new D(value).toFixed(2);

export function monthlyRate(rate: Rate): string {
  const annual = new D(rate.annualNetRate).div(100);
  return (
    rate.quotation === "effective" ? annual.plus(1).pow(new D(1).div(12)).minus(1) : annual.div(12)
  ).toString();
}

export function convertGrossToNet(grossPercent: string, taxPercent: string): string {
  return new D(grossPercent).mul(new D(1).minus(new D(taxPercent).div(100))).toString();
}

export interface AccountSnapshot {
  id: string;
  balance: string;
  pending: string;
  capitalized: string;
  retained: string;
  opened: boolean;
}

export interface AuditEntry {
  date: string;
  kind: string;
  amount: string;
  detail: string;
}

export interface AccountMonth {
  accountId: string;
  month: string;
  opening: string;
  openingAccrued: string;
  capitalIntroduced: string;
  contributions: string;
  transfersIn: string;
  transfersOut: string;
  interest: string;
  credited: string;
  reinvested: string;
  paidOut: string;
  withdrawals: string;
  fees: string;
  shortfall: string;
  closing: string;
  accrued: string;
  assets: string;
  audit: AuditEntry[];
}

export interface PortfolioMonth {
  month: string;
  opening: string;
  openingAccrued: string;
  capitalIntroduced: string;
  contributions: string;
  transfers: string;
  interest: string;
  credited: string;
  reinvested: string;
  paidOut: string;
  withdrawals: string;
  fees: string;
  shortfall: string;
  closing: string;
  accrued: string;
  assets: string;
  cumulativeContributions: string;
  cumulativeInterest: string;
  cumulativeWithdrawals: string;
  cumulativeReinvested: string;
  accounts: AccountMonth[];
  snapshots: AccountSnapshot[];
}

export interface Projection {
  rows: PortfolioMonth[];
  openingCapital: string;
  warnings: string[];
}

interface State {
  account: Account;
  balance: Decimal;
  pending: Decimal;
  capitalized: Decimal;
  retained: Decimal;
  opened: boolean;
  rates: Rate[];
}

export interface ProjectionOptions {
  initial?: AccountSnapshot[];
  portfolioWithdrawal?: { amount: string; start: string; frequency: "monthly" | "annual" };
}

function emptyAccountMonth(state: State, month: string): AccountMonth {
  return {
    accountId: state.account.id,
    month,
    opening: state.balance.toString(),
    openingAccrued: state.pending.toString(),
    capitalIntroduced: "0",
    contributions: "0",
    transfersIn: "0",
    transfersOut: "0",
    interest: "0",
    credited: "0",
    reinvested: "0",
    paidOut: "0",
    withdrawals: "0",
    fees: "0",
    shortfall: "0",
    closing: "0",
    accrued: "0",
    assets: "0",
    audit: [],
  };
}

function increment(row: AccountMonth, key: keyof AccountMonth, amount: Decimal): void {
  const value = row[key];
  if (typeof value !== "string") throw new Error("Invalid accounting field.");
  Object.assign(row, { [key]: new D(value).plus(amount).toString() });
}

function take(state: State, requested: Decimal, enforceMinimum = true): Decimal {
  const available = D.max(
    0,
    state.balance.minus(enforceMinimum ? state.account.minimumBalance : 0),
  );
  const actual = new D(D.min(requested, available));
  state.balance = state.balance.minus(actual);
  state.retained = D.max(0, state.retained.minus(actual));
  return actual;
}

function creditDue(month: string, frequency: Account["crediting"]): boolean {
  const index = Number(month.slice(5, 7));
  return frequency === "monthly" || (frequency === "quarterly" ? index % 3 === 0 : index === 12);
}

function dailyRate(state: State, rate: Rate, day: string): Decimal {
  const annual = new D(rate.annualNetRate).div(100);
  const month = day.slice(0, 7);
  switch (state.account.accrual) {
    case "monthly":
      return new D(monthlyRate(rate)).div(monthDays(month));
    case "daily-compound":
      return rate.quotation === "effective"
        ? annual
            .plus(1)
            .pow(new D(1).div(yearDays(day)))
            .minus(1)
        : annual.div(yearDays(day));
    case "daily-accrual": {
      if (rate.quotation === "nominal") return annual.div(yearDays(day));
      const period =
        state.account.crediting === "monthly"
          ? 1
          : state.account.crediting === "quarterly"
            ? 3
            : 12;
      return annual
        .plus(1)
        .pow(new D(period).div(12))
        .minus(1)
        .div(periodDays(month, state.account.crediting));
    }
    case "simple":
      return annual.div(yearDays(day));
  }
}

export function expandedTransactions(scenario: Scenario): Transaction[] {
  const result = [...scenario.transactions];
  for (const schedule of scenario.schedules) {
    if (
      schedule.paused ||
      scenario.accounts.find((item) => item.id === schedule.accountId)?.status !== "active"
    )
      continue;
    const start = schedule.start > scenario.start ? schedule.start : scenario.start;
    const end = schedule.end < scenario.end ? schedule.end : scenario.end;
    if (start > end) continue;
    for (const month of months(start, end)) {
      result.push({
        id: `${schedule.id}:${month}`,
        accountId: schedule.accountId,
        destinationId: schedule.destinationId,
        type: schedule.type,
        amount: schedule.amount,
        date: `${month}-${String(Math.min(schedule.day, monthDays(month))).padStart(2, "0")}`,
        timing: schedule.timing,
        note: "Recurring schedule",
      });
    }
  }
  const filtered = result.filter(
    (transaction) =>
      transaction.type !== "deposit" ||
      !scenario.contributionOverrides.some(
        (item) =>
          item.accountId === transaction.accountId && item.month === transaction.date.slice(0, 7),
      ),
  );
  for (const override of scenario.contributionOverrides) {
    filtered.push({
      id: `override:${override.accountId}:${override.month}`,
      accountId: override.accountId,
      destinationId: "",
      type: "deposit",
      amount: override.amount,
      date: `${override.month}-${String(Math.min(override.day, monthDays(override.month))).padStart(2, "0")}`,
      timing: override.timing,
      note: "Explicit monthly deposit override; replaces other external deposits for this account/month.",
    });
  }
  return filtered.sort(
    (a, b) =>
      a.date.localeCompare(b.date) || a.timing.localeCompare(b.timing) || a.id.localeCompare(b.id),
  );
}

export function project(input: Scenario, options: ProjectionOptions = {}): Projection {
  return runProjection(scenarioSchema.parse(input), options);
}

function runProjection(scenario: Scenario, options: ProjectionOptions = {}): Projection {
  const warnings: string[] = [];
  const firstDay = `${scenario.start}-01`;
  const states: State[] = scenario.accounts.map((account) => {
    const initial = options.initial?.find((item) => item.id === account.id);
    const opened = initial?.opened ?? account.openingDate <= firstDay;
    return {
      account,
      opened,
      balance: new D(initial?.balance ?? (opened ? account.openingBalance : "0")),
      pending: new D(initial?.pending ?? 0),
      capitalized: new D(initial?.capitalized ?? 0),
      retained: new D(initial?.retained ?? 0),
      rates: [...account.rates].sort((a, b) => a.effectiveDate.localeCompare(b.effectiveDate)),
    };
  });
  const byId = new Map(states.map((state) => [state.account.id, state]));
  const transactions = expandedTransactions(scenario);
  const byDay = new Map<string, Transaction[]>();
  for (const transaction of transactions) {
    const key = `${transaction.date}:${transaction.timing}`;
    byDay.set(key, [...(byDay.get(key) ?? []), transaction]);
  }
  const openingCapital = sum(states.map((state) => state.balance.toString()));
  const rateCache = new Map<string, Decimal>();
  let totalContributions = zero(),
    totalInterest = zero(),
    totalWithdrawals = zero(),
    totalReinvested = zero();
  const rows: PortfolioMonth[] = [];

  for (const month of months(scenario.start, scenario.end)) {
    let unallocatedShortfall = zero();
    const accountRows = new Map(
      states.map((state) => [state.account.id, emptyAccountMonth(state, month)]),
    );
    const transact = (day: string, timing: "start" | "end") => {
      for (const transaction of byDay.get(`${day}:${timing}`) ?? []) {
        const state = byId.get(transaction.accountId)!;
        const row = accountRows.get(transaction.accountId)!;
        const amount = new D(transaction.amount);
        if (!state.opened) throw new Error("Transaction precedes account opening.");
        if (transaction.type === "deposit") {
          state.balance = state.balance.plus(amount);
          increment(row, "contributions", amount);
          row.audit.push({
            date: day,
            kind: "External contribution",
            amount: amount.toString(),
            detail: `${timing} of day; ${transaction.note}`,
          });
        } else {
          const actual = take(state, amount);
          increment(row, transaction.type === "transfer" ? "transfersOut" : "withdrawals", actual);
          const shortfall = amount.minus(actual);
          increment(row, "shortfall", shortfall);
          row.audit.push({
            date: day,
            kind: transaction.type,
            amount: actual.negated().toString(),
            detail: `${timing} of day; requested ${amount}; ${transaction.note}`,
          });
          if (shortfall.gt(0))
            warnings.push(
              `${day}: ${state.account.name} could not fund ${money(shortfall)} of a ${transaction.type}.`,
            );
          if (transaction.type === "transfer") {
            const destination = byId.get(transaction.destinationId)!;
            if (!destination.opened) throw new Error("Transfer precedes destination opening.");
            destination.balance = destination.balance.plus(actual);
            const destinationRow = accountRows.get(destination.account.id)!;
            increment(destinationRow, "transfersIn", actual);
            destinationRow.audit.push({
              date: day,
              kind: "Transfer received",
              amount: actual.toString(),
              detail: `From ${state.account.name}; ${timing} of day`,
            });
          }
        }
      }
    };

    for (let day = `${month}-01`; day <= monthEnd(month); day = addDays(day, 1)) {
      for (const state of states) {
        if (!state.opened && state.account.openingDate === day) {
          state.opened = true;
          state.balance = new D(state.account.openingBalance);
          const row = accountRows.get(state.account.id)!;
          increment(row, "capitalIntroduced", state.balance);
          row.audit.push({
            date: day,
            kind: "Opening capital introduced",
            amount: state.balance.toString(),
            detail: "Opening principal, not a contribution or interest.",
          });
        }
      }
      transact(day, "start");
      for (const state of states) {
        if (!state.opened) continue;
        const rate = state.rates.findLast((item) => item.effectiveDate <= day);
        if (!rate) throw new Error(`No effective rate for ${state.account.name} on ${day}.`);
        const row = accountRows.get(state.account.id)!;
        const key = `${state.account.accrual}:${state.account.crediting}:${rate.quotation}:${rate.annualNetRate}:${month}`;
        let daily = rateCache.get(key);
        if (!daily) {
          daily = dailyRate(state, rate, day);
          rateCache.set(key, daily);
        }
        const base =
          state.account.accrual === "daily-compound"
            ? state.balance.plus(state.pending)
            : state.account.accrual === "monthly"
              ? state.balance.plus(state.capitalized)
              : state.account.accrual === "simple"
                ? D.max(0, state.balance.minus(state.retained))
                : state.balance;
        const earned = new D(base).mul(daily);
        state.pending = state.pending.plus(earned);
        increment(row, "interest", earned);
        if (
          day.endsWith("-01") ||
          day === state.account.openingDate ||
          rate.effectiveDate === day
        ) {
          row.audit.push({
            date: day,
            kind: "Rate and accrual",
            amount: rate.annualNetRate,
            detail: `${rate.quotation} annual net %; ${state.account.accrual}; daily factor ${daily.toPrecision(14)}; tax not deducted again. Gross/tax references: ${rate.grossRate ?? "unknown"}% / ${rate.taxRate ?? "unknown"}%.`,
          });
        }
        if (day === monthEnd(month)) {
          if (state.account.accrual === "monthly") state.capitalized = state.pending;
          if (creditDue(month, state.account.crediting)) {
            const credited = state.pending;
            state.balance = state.balance.plus(credited);
            state.retained = state.retained.plus(credited);
            increment(row, "credited", credited);
            const paidOut = credited.mul(state.account.payoutPercent).div(100);
            state.balance = state.balance.minus(paidOut);
            state.retained = state.retained.minus(paidOut);
            increment(row, "paidOut", paidOut);
            increment(row, "withdrawals", paidOut);
            increment(row, "reinvested", credited.minus(paidOut));
            row.audit.push({
              date: day,
              kind: "Net interest credited",
              amount: credited.toString(),
              detail: `${credited.minus(paidOut)} retained; ${paidOut} explicitly paid out.`,
            });
            state.pending = zero();
            state.capitalized = zero();
          }
          const configuredFee =
            [...state.account.feeChanges]
              .sort((a, b) => a.effectiveDate.localeCompare(b.effectiveDate))
              .findLast((item) => item.effectiveDate <= day)?.monthlyFee ??
            state.account.monthlyFee;
          const fee = take(state, new D(configuredFee), false);
          increment(row, "fees", fee);
          const unpaidFee = new D(configuredFee).minus(fee);
          increment(row, "shortfall", unpaidFee);
          if (fee.gt(0))
            row.audit.push({
              date: day,
              kind: "Separate fee",
              amount: fee.negated().toString(),
              detail: "Only configure fees not already included in the quoted net return.",
            });
          if (unpaidFee.gt(0))
            warnings.push(`${day}: unfunded fee ${money(unpaidFee)} for ${state.account.name}.`);
        }
      }
      transact(day, "end");
      const withdrawal = options.portfolioWithdrawal;
      if (
        withdrawal &&
        day === monthEnd(month) &&
        month >= withdrawal.start &&
        (withdrawal.frequency === "monthly" ||
          Number(month.slice(5)) === Number(withdrawal.start.slice(5)))
      ) {
        let remaining = new D(withdrawal.amount);
        for (const state of states) {
          if (!state.opened) continue;
          const actual = take(state, remaining);
          const row = accountRows.get(state.account.id)!;
          increment(row, "withdrawals", actual);
          row.audit.push({
            date: day,
            kind: "Strategy withdrawal",
            amount: actual.negated().toString(),
            detail: "Portfolio assets withdrawn in account-list order; not investment income.",
          });
          remaining = remaining.minus(actual);
        }
        if (remaining.gt(0)) {
          if (states.length)
            increment(accountRows.get(states[0].account.id)!, "shortfall", remaining);
          else unallocatedShortfall = unallocatedShortfall.plus(remaining);
          warnings.push(`${day}: portfolio withdrawal shortfall ${money(remaining)}.`);
        }
      }
    }
    for (const state of states) {
      const row = accountRows.get(state.account.id)!;
      row.closing = state.balance.toString();
      row.accrued = state.pending.toString();
      row.assets = state.balance.plus(state.pending).toString();
    }
    const accounts = [...accountRows.values()];
    const total = (key: keyof AccountMonth) =>
      sum(
        accounts.map((row) => {
          const value = row[key];
          return typeof value === "string" ? value : "0";
        }),
      );
    totalContributions = totalContributions.plus(total("contributions"));
    totalInterest = totalInterest.plus(total("interest"));
    totalWithdrawals = totalWithdrawals.plus(total("withdrawals"));
    totalReinvested = totalReinvested.plus(total("reinvested"));
    rows.push({
      month,
      opening: total("opening"),
      openingAccrued: total("openingAccrued"),
      capitalIntroduced: total("capitalIntroduced"),
      contributions: total("contributions"),
      transfers: total("transfersOut"),
      interest: total("interest"),
      credited: total("credited"),
      reinvested: total("reinvested"),
      paidOut: total("paidOut"),
      withdrawals: total("withdrawals"),
      fees: total("fees"),
      shortfall: new D(total("shortfall")).plus(unallocatedShortfall).toString(),
      closing: total("closing"),
      accrued: total("accrued"),
      assets: total("assets"),
      cumulativeContributions: totalContributions.toString(),
      cumulativeInterest: totalInterest.toString(),
      cumulativeWithdrawals: totalWithdrawals.toString(),
      cumulativeReinvested: totalReinvested.toString(),
      accounts,
      snapshots: states.map((state) => ({
        id: state.account.id,
        balance: state.balance.toString(),
        pending: state.pending.toString(),
        capitalized: state.capitalized.toString(),
        retained: state.retained.toString(),
        opened: state.opened,
      })),
    });
  }
  return { rows, openingCapital, warnings: [...new Set(warnings)] };
}

export interface IncomeCapacity {
  firstMonth: string;
  monthly: string;
  annual: string;
  averageMonthly: string;
  rows: PortfolioMonth[];
}

export function incomeCapacity(scenario: Scenario, row: PortfolioMonth): IncomeCapacity {
  const start = addMonths(row.month, 1);
  const future: Scenario = {
    ...scenario,
    start,
    end: addMonths(start, 11),
    accounts: scenario.accounts
      .filter((account) => row.snapshots.find((snapshot) => snapshot.id === account.id)?.opened)
      .map((account) => ({ ...account, payoutPercent: "100" })),
    transactions: [],
    schedules: [],
    contributionOverrides: [],
  };
  const projection = runProjection(future, { initial: row.snapshots });
  // Income capacity excludes later external funding and assumes explicit full payout.
  const net = projection.rows.map((item) => new D(item.interest).minus(item.fees).toString());
  const annual = sum(net);
  return {
    firstMonth: start,
    monthly: net[0] ?? "0",
    annual,
    averageMonthly: new D(annual).div(12).toString(),
    rows: projection.rows,
  };
}

export interface IncomeGoalResult {
  achieved: PortfolioMonth | null;
  capacity: IncomeCapacity | null;
  lastCapacity: IncomeCapacity | null;
  monthlyGap: string;
  annualGap: string;
  deadlineMet: boolean | null;
  hasTarget: boolean;
}

export function evaluateIncome(scenario: Scenario, projection: Projection): IncomeGoalResult {
  const goal = scenario.goal;
  const hasTarget =
    goal.enabled &&
    [goal.monthlyIncome, goal.annualIncome, goal.portfolioTarget].some((value) =>
      new D(value).gt(0),
    );
  let achieved: PortfolioMonth | null = null,
    capacity: IncomeCapacity | null = null,
    lastCapacity: IncomeCapacity | null = null;
  if (hasTarget) {
    for (const row of projection.rows) {
      const current = incomeCapacity(scenario, row);
      lastCapacity = current;
      if (
        new D(current.monthly).gte(goal.monthlyIncome) &&
        new D(current.annual).gte(goal.annualIncome) &&
        new D(row.assets).gte(goal.portfolioTarget)
      ) {
        achieved = row;
        capacity = current;
        break;
      }
    }
  }
  const display = capacity ?? lastCapacity;
  return {
    achieved,
    capacity,
    lastCapacity,
    hasTarget,
    monthlyGap: new D(display?.monthly ?? 0).minus(goal.monthlyIncome).toString(),
    annualGap: new D(display?.annual ?? 0).minus(goal.annualIncome).toString(),
    deadlineMet: goal.deadline && hasTarget ? !!achieved && achieved.month <= goal.deadline : null,
  };
}

export function requiredPortfolio(
  scenario: Scenario,
  strategy: "interest" | "withdrawal",
): FundingEstimate {
  const projection = project(scenario);
  const reference =
    strategy === "withdrawal"
      ? projection.rows.findLast((row) => row.month < scenario.goal.withdrawalStart)
      : projection.rows.at(-1);
  const accountIds = scenario.accounts.filter(
    (account) =>
      account.openingDate <=
      `${strategy === "withdrawal" ? scenario.goal.withdrawalStart : addMonths(scenario.end, 1)}-01`,
  );
  if (!accountIds.length)
    return { amount: null, reason: "Configure an account available at the evaluation date." };
  if (
    strategy === "interest" &&
    ![scenario.goal.monthlyIncome, scenario.goal.annualIncome, scenario.goal.portfolioTarget].some(
      (value) => new D(value).gt(0),
    )
  )
    return { amount: null, reason: "Configure a positive interest-income or balance target." };
  const weights = accountIds.map(
    (account) =>
      new D(
        reference?.accounts.find((item) => item.accountId === account.id)?.assets ??
          account.openingBalance,
      ),
  );
  const totalWeight = weights.reduce((total, weight) => total.plus(weight), zero());
  const start =
    strategy === "withdrawal" ? scenario.goal.withdrawalStart : addMonths(scenario.end, 1);
  const reaches = (capital: Decimal) => {
    const draft = structuredClone(scenario);
    draft.start = start;
    draft.end =
      strategy === "withdrawal"
        ? addMonths(start, draft.goal.evaluationMonths - 1)
        : addMonths(start, 11);
    draft.accounts = accountIds.map((account, index) => ({
      ...account,
      openingDate: `${start}-01`,
      payoutPercent: strategy === "interest" ? "100" : "0",
      openingBalance: capital
        .mul(totalWeight.gt(0) ? weights[index].div(totalWeight) : new D(1).div(accountIds.length))
        .toFixed(8),
    }));
    draft.transactions = [];
    draft.schedules = [];
    draft.contributionOverrides = [];
    if (strategy === "withdrawal")
      return evaluateWithdrawals(draft, {
        rows: [],
        openingCapital: capital.toString(),
        warnings: [],
      }).objectiveMet;
    const rows = runProjection(draft).rows;
    return (
      capital.gte(draft.goal.portfolioTarget) &&
      new D(rows[0].interest).minus(rows[0].fees).gte(draft.goal.monthlyIncome) &&
      new D(sum(rows.map((row) => new D(row.interest).minus(row.fees).toString()))).gte(
        draft.goal.annualIncome,
      )
    );
  };
  if (reaches(zero()))
    return { amount: "0", reason: "No capital required under the configured zero targets." };
  let low = zero(),
    high = new D(1000);
  while (high.lt("1000000000000") && !reaches(high)) high = high.mul(10);
  if (!reaches(high))
    return {
      amount: null,
      reason:
        "No feasible portfolio found up to 1 trillion under these assumptions and evaluation horizon.",
    };
  for (let index = 0; index < 40 && high.minus(low).gt("0.01"); index++) {
    const middle = low.plus(high).div(2);
    if (reaches(middle)) high = middle;
    else low = middle;
  }
  return {
    amount: high.toDecimalPlaces(2, Decimal.ROUND_CEIL).toString(),
    reason: `Estimated at ${start}; current account weights (equal if unfunded), no future external contributions, configured rates/fees, ${strategy === "withdrawal" ? `${scenario.goal.evaluationMonths}-month evaluation` : "12-month full-payout assessment"}. Conditional projection, not a safe-rate guarantee.`,
  };
}

export function earliestWithdrawal(
  scenario: Scenario,
  accumulation = project(scenario),
): { month: string | null; contributions: string | null } {
  const candidates = [
    { month: scenario.start, contributions: "0" },
    ...accumulation.rows.map((row) => ({
      month: addMonths(row.month, 1),
      contributions: row.cumulativeContributions,
    })),
  ];
  for (const candidate of candidates) {
    const draft = {
      ...scenario,
      transactions: scenario.transactions.filter(
        (item) => item.type !== "deposit" || item.date < `${candidate.month}-01`,
      ),
      schedules: scenario.schedules.filter(
        (item) => item.type !== "deposit" || item.end < candidate.month,
      ),
      contributionOverrides: scenario.contributionOverrides.filter(
        (item) => item.month < candidate.month,
      ),
      goal: { ...scenario.goal, withdrawalStart: candidate.month },
    };
    if (evaluateWithdrawals(draft, accumulation).objectiveMet)
      return { month: candidate.month, contributions: candidate.contributions };
  }
  return { month: null, contributions: null };
}

export function principalTrend(
  value: string,
  benchmark: string,
): "growing" | "stable" | "declining" {
  const difference = new D(value).minus(benchmark);
  return difference.abs().lte("0.01") ? "stable" : difference.gt(0) ? "growing" : "declining";
}

export interface WithdrawalMonth {
  row: PortfolioMonth;
  nominalBenchmark: string;
  realBenchmark: string;
  realBalance: string;
  nominalTrend: ReturnType<typeof principalTrend>;
  realTrend: ReturnType<typeof principalTrend> | null;
}

export interface WithdrawalResult {
  startingBalance: string;
  start: string;
  end: string;
  rows: WithdrawalMonth[];
  projection: Projection;
  firstMinimumBreach: string | null;
  depletion: string | null;
  firstObjectiveBreach: string | null;
  objectiveMet: boolean;
  finalShortfall: string;
  reason: string | null;
}

export function evaluateWithdrawals(
  scenario: Scenario,
  accumulation = project(scenario),
): WithdrawalResult {
  const goal = scenario.goal;
  const start = goal.withdrawalStart;
  const prior = accumulation.rows.findLast((row) => row.month < start);
  const end = addMonths(start, goal.evaluationMonths - 1);
  if (start < scenario.start || start > addMonths(scenario.end, 1)) {
    return {
      startingBalance: "0",
      start,
      end,
      rows: [],
      projection: { rows: [], openingCapital: "0", warnings: [] },
      firstMinimumBreach: null,
      depletion: null,
      firstObjectiveBreach: null,
      objectiveMet: false,
      finalShortfall: "0",
      reason:
        "Withdrawal start must be within the projection or the immediately following month. Extend the accumulation horizon first.",
    };
  }
  const future: Scenario = {
    ...scenario,
    start,
    end,
    accounts: scenario.accounts.map((account) => ({ ...account, payoutPercent: "0" })),
  };
  const projection = runProjection(future, {
    initial: prior?.snapshots,
    portfolioWithdrawal: {
      amount: goal.withdrawalAmount,
      start,
      frequency: goal.withdrawalFrequency,
    },
  });
  const startingBalance =
    prior?.assets ??
    sum(
      projection.rows[0]?.snapshots.map((snapshot) => {
        const account = scenario.accounts.find((item) => item.id === snapshot.id)!;
        return account.openingDate <= `${start}-01` ? account.openingBalance : "0";
      }) ?? [],
    );
  let introduced = zero(),
    inflation = new D(1),
    realBenchmark = new D(startingBalance),
    firstObjectiveBreach: string | null = null;
  const inflationMonthly = goal.inflationEnabled
    ? new D(1).plus(new D(goal.inflation).div(100)).pow(new D(1).div(12))
    : new D(1);
  const rows: WithdrawalMonth[] = projection.rows.map((row) => {
    inflation = inflation.mul(inflationMonthly);
    introduced = introduced.plus(row.capitalIntroduced);
    const nominalBenchmark = new D(startingBalance).plus(introduced);
    realBenchmark = realBenchmark.mul(inflationMonthly);
    for (const accountRow of row.accounts) {
      if (new D(accountRow.capitalIntroduced).gt(0)) {
        const openingDay = Number(
          scenario.accounts
            .find((account) => account.id === accountRow.accountId)!
            .openingDate.slice(8),
        );
        const fraction = new D(monthDays(row.month) - openingDay + 1).div(monthDays(row.month));
        realBenchmark = realBenchmark.plus(
          new D(accountRow.capitalIntroduced).mul(inflationMonthly.pow(fraction)),
        );
      }
    }
    const nominalTrend = principalTrend(row.assets, nominalBenchmark.toString());
    const realTrend = goal.inflationEnabled
      ? principalTrend(row.assets, realBenchmark.toString())
      : null;
    const failed =
      goal.objective === "nominal"
        ? nominalTrend === "declining"
        : goal.objective === "real"
          ? goal.inflationEnabled
            ? realTrend === "declining"
            : nominalTrend === "declining"
          : false;
    if (failed && !firstObjectiveBreach) firstObjectiveBreach = row.month;
    return {
      row,
      nominalBenchmark: nominalBenchmark.toString(),
      realBenchmark: realBenchmark.toString(),
      realBalance: new D(row.assets).div(inflation).toString(),
      nominalTrend,
      realTrend,
    };
  });
  const last = rows.at(-1);
  const benchmark = goal.objective === "real" ? last?.realBenchmark : last?.nominalBenchmark;
  const finalShortfall =
    goal.objective === "drawdown"
      ? "0"
      : D.max(0, new D(benchmark ?? 0).minus(last?.row.assets ?? 0)).toString();
  const unfunded = projection.rows.some((row) => new D(row.shortfall).gt("0.01"));
  return {
    startingBalance,
    start,
    end,
    rows,
    projection,
    firstMinimumBreach:
      rows.find((item) => new D(item.row.assets).lt(goal.minimumBalance))?.row.month ?? null,
    depletion: rows.find((item) => new D(item.row.assets).lte("0.005"))?.row.month ?? null,
    firstObjectiveBreach,
    objectiveMet:
      !firstObjectiveBreach &&
      !unfunded &&
      !rows.some((item) => new D(item.row.assets).lt(goal.minimumBalance)),
    finalShortfall,
    reason:
      goal.objective === "real" && !goal.inflationEnabled
        ? "Inflation is disabled; the real-preservation test currently uses zero inflation."
        : null,
  };
}

export interface FundingEstimate {
  amount: string | null;
  reason: string;
}

export function requiredFunding(scenario: Scenario, kind: "lump" | "monthly"): FundingEstimate {
  const account = scenario.accounts.find((item) => item.status === "active");
  const deadline = scenario.goal.deadline;
  if (!account || !deadline || deadline < scenario.start || deadline > scenario.end)
    return {
      amount: null,
      reason: "Choose an active account and a deadline within the projection.",
    };
  const target = scenario.goal;
  if (
    ![target.monthlyIncome, target.annualIncome, target.portfolioTarget].some((value) =>
      new D(value).gt(0),
    )
  )
    return { amount: null, reason: "Set at least one positive interest-income or balance target." };
  const reaches = (amount: Decimal) => {
    const draft = structuredClone(scenario);
    draft.end = deadline;
    if (kind === "lump")
      draft.transactions.push({
        id: "solver-lump",
        accountId: account.id,
        destinationId: "",
        type: "deposit",
        amount: amount.toFixed(8),
        date: account.openingDate > `${draft.start}-01` ? account.openingDate : `${draft.start}-01`,
        timing: "start",
        note: "Explicit funding estimate",
      });
    else
      draft.schedules.push({
        id: "solver-monthly",
        accountId: account.id,
        destinationId: "",
        type: "deposit",
        amount: amount.toFixed(8),
        start:
          account.openingDate.slice(0, 7) > draft.start
            ? account.openingDate.slice(0, 7)
            : draft.start,
        end: deadline,
        day: Math.max(1, Number(account.openingDate.slice(8))),
        timing: "start",
        paused: false,
      });
    const row = project(draft).rows.at(-1)!;
    const income = incomeCapacity(draft, row);
    return (
      new D(row.assets).gte(target.portfolioTarget) &&
      new D(income.monthly).gte(target.monthlyIncome) &&
      new D(income.annual).gte(target.annualIncome)
    );
  };
  if (account.openingDate.slice(0, 7) > deadline)
    return { amount: null, reason: "The selected funding account opens after the deadline." };
  if (reaches(zero()))
    return { amount: "0", reason: "No additional funding is required at the deadline." };
  let low = zero(),
    high = new D(1000);
  while (!reaches(high) && high.lt("1000000000000")) high = high.mul(10);
  if (!reaches(high))
    return { amount: null, reason: "No solution found within the funding search limit." };
  for (let index = 0; index < 42 && high.minus(low).gt("0.01"); index++) {
    const middle = low.plus(high).div(2);
    if (reaches(middle)) high = middle;
    else low = middle;
  }
  return {
    amount: high.toDecimalPlaces(2, Decimal.ROUND_CEIL).toString(),
    reason: `Additional ${kind === "lump" ? "opening lump sum" : "monthly contribution"} to ${account.name}; tests the deadline, not every intervening month. Rates and all other assumptions unchanged.`,
  };
}
