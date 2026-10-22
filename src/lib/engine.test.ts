import { describe, expect, it } from "vitest";
import { newAccount, newScenario, duplicateScenario, scenarioSchema } from "./model";
import {
  convertGrossToNet,
  evaluateIncome,
  evaluateWithdrawals,
  incomeCapacity,
  monthlyRate,
  project,
  requiredFunding,
  requiredPortfolio,
  earliestWithdrawal,
  sum,
} from "./engine";

function fixture() {
  const scenario = newScenario();
  scenario.start = "2027-01";
  scenario.end = "2027-12";
  const account = newAccount(scenario.start);
  account.openingBalance = "100000";
  account.rates[0] = { effectiveDate: "2027-01-01", annualNetRate: "12", quotation: "nominal" };
  scenario.accounts = [account];
  scenario.goal.withdrawalStart = "2027-01";
  scenario.goal.evaluationMonths = 12;
  return scenario;
}

describe("rate conventions and reinvestment", () => {
  it("converts effective annual net rates independently of nominal annual rates", () => {
    const rate = {
      effectiveDate: "2027-01-01",
      annualNetRate: "10",
      quotation: "effective" as const,
    };
    // Independent binary floating-point oracle, compared at a financial tolerance.
    expect(Number(monthlyRate(rate))).toBeCloseTo(Math.pow(1.1, 1 / 12) - 1, 13);
    expect(Number(monthlyRate({ ...rate, quotation: "nominal" }))).toBeCloseTo(0.1 / 12, 13);
    const scenario = fixture();
    scenario.accounts[0].rates = [rate];
    expect(Number(project(scenario).rows.at(-1)!.closing)).toBeCloseTo(110000, 6);
  });

  it("compounds nominal monthly interest and defaults to full reinvestment", () => {
    const scenario = fixture();
    const rows = project(scenario).rows;
    expect(scenario.accounts[0].payoutPercent).toBe("0");
    expect(Number(rows[0].interest)).toBeCloseTo(1000, 8);
    expect(Number(rows[1].interest)).toBeCloseTo(1010, 8);
    expect(Number(rows.at(-1)!.closing)).toBeCloseTo(100000 * 1.01 ** 12, 6);
    expect(rows[0].contributions).toBe("0");
    expect(rows[0].reinvested).toBe(rows[0].credited);
  });

  it("does not deduct tax from a net rate, even with conflicting references", () => {
    const scenario = fixture();
    scenario.accounts[0].rates[0].grossRate = "15";
    scenario.accounts[0].rates[0].taxRate = "20";
    expect(Number(project(scenario).rows[0].interest)).toBeCloseTo(1000, 8);
    expect(convertGrossToNet("15", "20")).toBe("12");
    expect(scenario.accounts[0].rates[0].annualNetRate).toBe("12");
  });

  it("handles zero rates, zero capital, multiple accounts and payout", () => {
    const scenario = fixture();
    scenario.accounts[0].rates[0].annualNetRate = "0";
    expect(project(scenario).rows.at(-1)!.closing).toBe("100000");
    scenario.accounts[0].openingBalance = "0";
    expect(project(scenario).rows.at(-1)!.closing).toBe("0");
    const second = newAccount("2027-01");
    second.openingBalance = "50000";
    second.rates[0].annualNetRate = "12";
    second.rates[0].quotation = "nominal";
    second.payoutPercent = "100";
    scenario.accounts.push(second);
    const rows = project(scenario).rows;
    expect(rows[0].closing).toBe("50000");
    expect(Number(rows[0].paidOut)).toBeCloseTo(500, 8);
    expect(Number(rows.at(-1)!.cumulativeWithdrawals)).toBeCloseTo(6000, 6);
    expect(rows.at(-1)!.cumulativeContributions).toBe("0");
  });

  it("keeps pending interest distinct from credited balances with quarterly crediting", () => {
    const scenario = fixture();
    scenario.accounts[0].crediting = "quarterly";
    const rows = project(scenario).rows;
    expect(rows[0].closing).toBe("100000");
    expect(Number(rows[0].accrued)).toBeCloseTo(1000, 8);
    expect(Number(rows[1].interest)).toBeCloseTo(1010, 8);
    expect(Number(rows[2].closing)).toBeCloseTo(103030.1, 6);
    expect(rows[2].accrued).toBe("0");
  });

  it("supports actual-day accrual, daily compounding, and noncompounding simple interest", () => {
    const scenario = fixture();
    scenario.accounts[0].accrual = "daily-accrual";
    expect(Number(project(scenario).rows[0].interest)).toBeCloseTo((100000 * 0.12 * 31) / 365, 7);
    scenario.accounts[0].accrual = "daily-compound";
    expect(Number(project(scenario).rows.at(-1)!.closing)).toBeCloseTo(
      100000 * (1 + 0.12 / 365) ** 365,
      6,
    );
    scenario.accounts[0].rates[0].quotation = "effective";
    expect(Number(project(scenario).rows.at(-1)!.closing)).toBeCloseTo(112000, 6);
    scenario.accounts[0].accrual = "simple";
    expect(Number(project(scenario).rows.at(-1)!.closing)).toBeCloseTo(112000, 6);
  });
});

describe("dated transactions and rate changes", () => {
  it("prorates a mid-month contribution and respects start/end timing", () => {
    const scenario = fixture();
    scenario.accounts[0].openingBalance = "0";
    scenario.transactions = [
      {
        id: "deposit",
        accountId: scenario.accounts[0].id,
        destinationId: "",
        type: "deposit",
        amount: "31000",
        date: "2027-01-16",
        timing: "start",
        note: "",
      },
    ];
    expect(Number(project(scenario).rows[0].interest)).toBeCloseTo(160, 8);
    scenario.transactions[0].timing = "end";
    expect(Number(project(scenario).rows[0].interest)).toBeCloseTo(150, 8);
    expect(project(scenario).rows[0].contributions).toBe("31000");
  });

  it("applies a new rate only from its effective date", () => {
    const scenario = fixture();
    scenario.accounts[0].rates.push({
      effectiveDate: "2027-01-16",
      annualNetRate: "24",
      quotation: "nominal",
    });
    const row = project(scenario).rows[0];
    expect(Number(row.interest)).toBeCloseTo((100000 * (0.01 * 15 + 0.02 * 16)) / 31, 8);
    const next = structuredClone(scenario);
    next.accounts[0].rates[1].effectiveDate = "2027-02-01";
    expect(Number(project(next).rows[0].interest)).toBeCloseTo(1000, 8);
  });

  it("withdrawals reduce assets but never increase contributions or interest", () => {
    const scenario = fixture();
    scenario.transactions.push({
      id: "withdraw",
      accountId: scenario.accounts[0].id,
      destinationId: "",
      type: "withdrawal",
      amount: "2000",
      date: "2027-01-31",
      timing: "end",
      note: "",
    });
    const rows = project(scenario).rows;
    expect(Number(rows[0].closing)).toBeCloseTo(99000, 8);
    expect(rows[0].contributions).toBe("0");
    expect(Number(rows[0].interest)).toBeCloseTo(1000, 8);
    expect(Number(rows[1].interest)).toBeCloseTo(990, 8);
    expect(rows[0].withdrawals).toBe("2000");
  });

  it("reconciles internal transfers and all monthly account totals", () => {
    const scenario = fixture();
    const other = newAccount("2027-01");
    other.rates[0].annualNetRate = "0";
    scenario.accounts.push(other);
    scenario.transactions.push({
      id: "transfer",
      accountId: scenario.accounts[0].id,
      destinationId: other.id,
      type: "transfer",
      amount: "10000",
      date: "2027-01-01",
      timing: "start",
      note: "",
    });
    const rows = project(scenario).rows;
    expect(Number(rows[0].closing)).toBeCloseTo(100900, 8);
    expect(rows[0].contributions).toBe("0");
    for (const row of rows) {
      expect(row.closing).toBe(sum(row.accounts.map((account) => account.closing)));
      expect(Number(row.closing)).toBeCloseTo(
        Number(row.opening) +
          Number(row.capitalIntroduced) +
          Number(row.contributions) -
          Number(row.withdrawals) +
          Number(row.credited) -
          Number(row.fees),
        6,
      );
    }
  });

  it("stops schedules at their end date and recalculates future months after edits", () => {
    const scenario = fixture();
    scenario.schedules.push({
      id: "schedule",
      accountId: scenario.accounts[0].id,
      destinationId: "",
      type: "deposit",
      amount: "1000",
      start: "2027-01",
      end: "2027-02",
      day: 31,
      timing: "end",
      paused: false,
    });
    const before = project(scenario);
    expect(before.rows[0].contributions).toBe("1000");
    expect(before.rows[1].contributions).toBe("1000");
    expect(before.rows[2].contributions).toBe("0");
    scenario.schedules[0].amount = "2000";
    expect(Number(project(scenario).rows.at(-1)!.closing)).toBeGreaterThan(
      Number(before.rows.at(-1)!.closing),
    );
  });

  it("introduces later opening capital without misclassifying it as contributions", () => {
    const scenario = fixture();
    scenario.accounts[0].openingDate = "2027-02-15";
    const rows = project(scenario).rows;
    expect(rows[0].closing).toBe("0");
    expect(rows[1].opening).toBe("0");
    expect(rows[1].capitalIntroduced).toBe("100000");
    expect(rows[1].contributions).toBe("0");
  });
});

describe("financial freedom strategies", () => {
  it("separates observed monthly interest from forward annual income", () => {
    const scenario = fixture();
    const row = project(scenario).rows[0];
    const capacity = incomeCapacity(scenario, row);
    expect(Number(row.interest)).toBeCloseTo(1000, 8);
    expect(Number(capacity.monthly)).toBeCloseTo(1010, 8);
    expect(Number(capacity.annual)).toBeCloseTo(12120, 6);
    scenario.accounts[0].rates.push({
      effectiveDate: "2027-03-01",
      annualNetRate: "6",
      quotation: "nominal",
    });
    expect(Number(incomeCapacity(scenario, project(scenario).rows[0]).annual)).toBeCloseTo(
      1010 + 11 * 505,
      6,
    );
  });

  it("finds an optional target, supports deadline failure and leaves the plan unchanged", () => {
    const scenario = fixture();
    expect(evaluateIncome(scenario, project(scenario)).hasTarget).toBe(false);
    scenario.goal.enabled = true;
    scenario.goal.monthlyIncome = "1020";
    scenario.goal.deadline = "2027-01";
    const saved = JSON.stringify(scenario);
    const result = evaluateIncome(scenario, project(scenario));
    expect(result.achieved?.month).toBe("2027-02");
    expect(result.deadlineMet).toBe(false);
    evaluateWithdrawals(scenario);
    expect(JSON.stringify(scenario)).toBe(saved);
    const duplicate = duplicateScenario(scenario, "Alternative");
    duplicate.accounts[0].openingBalance = "1";
    expect(scenario.accounts[0].openingBalance).toBe("100000");
    scenario.goal.monthlyIncome = "100000000";
    expect(evaluateIncome(scenario, project(scenario)).achieved).toBeNull();
  });

  it("preserves nominal principal with interest-matching monthly withdrawals", () => {
    const scenario = fixture();
    scenario.goal.withdrawalAmount = "1000";
    const result = evaluateWithdrawals(scenario);
    expect(result.objectiveMet).toBe(true);
    expect(result.rows[0].nominalTrend).toBe("stable");
    expect(Number(result.rows.at(-1)!.row.assets)).toBeCloseTo(100000, 6);
    expect(Number(result.rows.at(-1)!.row.cumulativeWithdrawals)).toBeCloseTo(12000, 6);
  });

  it("does not confuse nominal preservation with purchasing-power preservation", () => {
    const scenario = fixture();
    scenario.goal.withdrawalAmount = "1000";
    scenario.goal.objective = "real";
    scenario.goal.inflationEnabled = true;
    scenario.goal.inflation = "6";
    const result = evaluateWithdrawals(scenario);
    expect(result.objectiveMet).toBe(false);
    expect(result.firstObjectiveBreach).toBe("2027-01");
    expect(result.rows.at(-1)!.nominalTrend).toBe("stable");
    expect(result.rows.at(-1)!.realTrend).toBe("declining");
    expect(Number(result.finalShortfall)).toBeCloseTo(6000, 6);
    scenario.goal.withdrawalAmount = "0";
    expect(evaluateWithdrawals(scenario).objectiveMet).toBe(true);
  });

  it("projects gradual drawdown, minimum breaches, depletion and unfunded withdrawals", () => {
    const scenario = fixture();
    scenario.accounts[0].openingBalance = "1000";
    scenario.accounts[0].rates[0].annualNetRate = "0";
    scenario.goal.withdrawalAmount = "300";
    scenario.goal.minimumBalance = "500";
    scenario.goal.objective = "drawdown";
    scenario.goal.evaluationMonths = 5;
    const result = evaluateWithdrawals(scenario);
    expect(result.firstMinimumBreach).toBe("2027-02");
    expect(result.depletion).toBe("2027-04");
    expect(result.rows[3].row.shortfall).toBe("200");
    expect(result.rows[3].row.assets).toBe("0");
    expect(result.rows[3].row.cumulativeContributions).toBe("0");
    expect(result.rows[3].row.cumulativeInterest).toBe("0");
    expect(result.rows[3].row.cumulativeWithdrawals).toBe("1000");
  });

  it("solves additional funding against the same engine", () => {
    const scenario = fixture();
    scenario.goal.enabled = true;
    scenario.goal.deadline = "2027-01";
    scenario.goal.portfolioTarget = "202000";
    const estimate = requiredFunding(scenario, "lump");
    expect(Number(estimate.amount)).toBeCloseTo(100000, 2);
  });

  it("rejects invalid dates, mixed currencies and missing mappings", () => {
    const scenario = fixture();
    scenario.accounts[0].openingDate = "2027-02-30";
    expect(scenarioSchema.safeParse(scenario).success).toBe(false);
    scenario.accounts[0].openingDate = "2027-01-01";
    scenario.accounts[0].currency = "USD";
    expect(scenarioSchema.safeParse(scenario).success).toBe(false);
  });

  it("calculates conditional required portfolio balances and the earliest withdrawal start", () => {
    const scenario = fixture();
    scenario.goal.enabled = true;
    scenario.goal.monthlyIncome = "1000";
    scenario.goal.withdrawalAmount = "1000";
    expect(Number(requiredPortfolio(scenario, "interest").amount)).toBeCloseTo(100000, 1);
    expect(Number(requiredPortfolio(scenario, "withdrawal").amount)).toBeCloseTo(100000, 0);
    expect(earliestWithdrawal(scenario).month).toBe("2027-01");
    scenario.accounts[0].rates[0].annualNetRate = "0";
    expect(requiredPortfolio(scenario, "withdrawal").amount).toBeNull();
  });

  it("handles annual withdrawal dates without pretending monthly cash was paid", () => {
    const scenario = fixture();
    scenario.goal.withdrawalFrequency = "annual";
    scenario.goal.withdrawalAmount = "1200";
    scenario.goal.objective = "drawdown";
    scenario.goal.evaluationMonths = 14;
    const result = evaluateWithdrawals(scenario);
    expect(result.rows[0].row.withdrawals).toBe("1200");
    expect(result.rows[1].row.withdrawals).toBe("0");
    expect(result.rows[12].row.withdrawals).toBe("1200");
    expect(result.rows[13].row.cumulativeWithdrawals).toBe("2400");
  });

  it("preserves uncredited accrued interest when branching into withdrawals", () => {
    const scenario = fixture();
    scenario.accounts[0].crediting = "quarterly";
    scenario.goal.withdrawalStart = "2027-02";
    scenario.goal.withdrawalAmount = "0";
    scenario.goal.evaluationMonths = 2;
    const result = evaluateWithdrawals(scenario);
    expect(Number(result.startingBalance)).toBeCloseTo(101000, 7);
    expect(Number(result.rows[0].row.accrued)).toBeCloseTo(2010, 7);
    expect(Number(result.rows[1].row.closing)).toBeCloseTo(103030.1, 6);
  });

  it("keeps account minimums and separate fees out of investment income", () => {
    const scenario = fixture();
    scenario.accounts[0].minimumBalance = "100000";
    scenario.accounts[0].monthlyFee = "100";
    scenario.transactions.push({
      id: "restricted",
      accountId: scenario.accounts[0].id,
      destinationId: "",
      type: "withdrawal",
      amount: "2000",
      date: "2027-01-31",
      timing: "end",
      note: "",
    });
    const row = project(scenario).rows[0];
    expect(Number(row.interest)).toBeCloseTo(1000, 7);
    expect(row.fees).toBe("100");
    expect(Number(row.withdrawals)).toBeCloseTo(900, 7);
    expect(Number(row.shortfall)).toBeCloseTo(1100, 7);
    expect(row.closing).toBe("100000");
  });

  it("supports leap-day daily accrual and late-opening scheduled deposits", () => {
    const scenario = fixture();
    scenario.start = "2028-02";
    scenario.end = "2028-02";
    scenario.accounts[0].openingDate = "2028-02-15";
    scenario.accounts[0].accrual = "daily-accrual";
    scenario.schedules.push({
      id: "late",
      accountId: scenario.accounts[0].id,
      destinationId: "",
      type: "deposit",
      amount: "1000",
      start: "2028-02",
      end: "2028-02",
      day: 31,
      timing: "end",
      paused: false,
    });
    const row = project(scenario).rows[0];
    expect(row.contributions).toBe("1000");
    expect(Number(row.interest)).toBeCloseTo((100000 * 0.12 * 15) / 366, 7);
  });

  it("monthly overrides replace deposits only in the selected account and month", () => {
    const scenario = fixture();
    scenario.schedules.push({
      id: "recurring",
      accountId: scenario.accounts[0].id,
      destinationId: "",
      type: "deposit",
      amount: "1000",
      start: "2027-01",
      end: "2027-03",
      day: 1,
      timing: "start",
      paused: false,
    });
    scenario.transactions.push({
      id: "extra",
      accountId: scenario.accounts[0].id,
      destinationId: "",
      type: "deposit",
      amount: "500",
      date: "2027-02-01",
      timing: "start",
      note: "",
    });
    scenario.contributionOverrides.push({
      accountId: scenario.accounts[0].id,
      month: "2027-02",
      amount: "200",
      day: 14,
      timing: "start",
    });
    const rows = project(scenario).rows;
    expect(rows.slice(0, 3).map((row) => row.contributions)).toEqual(["1000", "200", "1000"]);
    scenario.contributionOverrides = [];
    expect(project(scenario).rows[1].contributions).toBe("1500");
  });

  it("never claims unfunded withdrawals are sustainable when no accounts exist", () => {
    const scenario = fixture();
    scenario.accounts = [];
    scenario.goal.withdrawalAmount = "1000";
    const result = evaluateWithdrawals(scenario);
    expect(result.objectiveMet).toBe(false);
    expect(result.rows[0].row.shortfall).toBe("1000");
    expect(result.projection.warnings[0]).toContain("withdrawal shortfall");
  });

  it("can assess forward income and withdrawals at the supported calendar boundary", () => {
    const scenario = fixture();
    scenario.start = "2200-12";
    scenario.end = "2200-12";
    scenario.goal.withdrawalStart = "2200-12";
    scenario.goal.evaluationMonths = 24;
    const projection = project(scenario);
    expect(incomeCapacity(scenario, projection.rows[0]).rows.at(-1)!.month).toBe("2201-12");
    expect(evaluateWithdrawals(scenario).rows.at(-1)!.row.month).toBe("2202-11");
  });

  it("applies fee changes at charging dates without modifying earlier charges", () => {
    const scenario = fixture();
    scenario.accounts[0].monthlyFee = "100";
    scenario.accounts[0].feeChanges = [{ effectiveDate: "2027-02-15", monthlyFee: "200" }];
    const projection = project(scenario);
    expect(projection.rows[0].fees).toBe("100");
    expect(projection.rows[1].fees).toBe("200");
    expect(Number(projection.rows[0].closing)).toBeCloseTo(100900, 7);
    expect(Number(projection.rows[1].closing)).toBeCloseTo(101709, 7);
  });

  it("does not call continuing external deposits financial freedom", () => {
    const scenario = fixture();
    scenario.end = "2027-01";
    scenario.accounts[0].openingBalance = "0";
    scenario.accounts[0].rates[0].annualNetRate = "0";
    scenario.goal.withdrawalAmount = "1000";
    scenario.schedules.push({
      id: "funding",
      accountId: scenario.accounts[0].id,
      destinationId: "",
      type: "deposit",
      amount: "1000",
      start: "2027-01",
      end: "2028-12",
      day: 1,
      timing: "start",
      paused: false,
    });
    expect(evaluateWithdrawals(scenario).objectiveMet).toBe(true);
    expect(earliestWithdrawal(scenario).month).toBeNull();
  });
});
