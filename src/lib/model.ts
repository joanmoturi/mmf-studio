import { z } from "zod";
import { addMonths, date, iso, monthDays, monthsBetween } from "./dates";

const numeric = z
  .string()
  .max(24)
  .regex(/^\d+(\.\d{1,12})?$/, "Use a non-negative decimal number.");
const amount = numeric.refine((value) => Number(value) <= 1e15, "Amount is too large.");
const percent = numeric.refine((value) => Number(value) <= 100, "Use a percentage from 0 to 100.");
const month = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
  .refine(
    (value) => Number(value.slice(0, 4)) >= 1900 && Number(value.slice(0, 4)) <= 2200,
    "Use a year between 1900 and 2200.",
  );
const day = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])-\d{2}$/)
  .refine(
    (value) =>
      !Number.isNaN(date(value).getTime()) &&
      iso(date(value)) === value &&
      Number(value.slice(0, 4)) >= 1900 &&
      Number(value.slice(0, 4)) <= 2250,
    "Use a valid calendar date.",
  );
const id = z.string().min(1).max(100);
const label = z.string().trim().min(1).max(100);

export const rateSchema = z.object({
  effectiveDate: day,
  annualNetRate: percent,
  quotation: z.enum(["effective", "nominal"]),
  grossRate: percent.optional(),
  taxRate: percent.optional(),
});
export type Rate = z.infer<typeof rateSchema>;

export const accountSchema = z
  .object({
    id,
    name: label,
    provider: z.string().max(100),
    category: z.enum(["MMF", "Fixed income", "Savings", "Custom"]),
    currency: z.string().regex(/^[A-Z]{3}$/),
    openingBalance: amount,
    openingDate: day,
    status: z.enum(["active", "inactive", "archived"]),
    rates: z.array(rateSchema).min(1).max(100),
    accrual: z.enum(["monthly", "daily-accrual", "daily-compound", "simple"]),
    crediting: z.enum(["monthly", "quarterly", "annually"]),
    payoutPercent: percent,
    monthlyFee: amount,
    feeChanges: z
      .array(z.object({ effectiveDate: day, monthlyFee: amount }))
      .max(100)
      .default([]),
    minimumBalance: amount,
    notes: z.string().max(2000),
  })
  .superRefine((account, ctx) => {
    const dates = account.rates.map((rate) => rate.effectiveDate);
    if (new Set(dates).size !== dates.length)
      ctx.addIssue({ code: "custom", message: "Rate effective dates must be unique." });
    if (
      new Set(account.feeChanges.map((item) => item.effectiveDate)).size !==
      account.feeChanges.length
    )
      ctx.addIssue({ code: "custom", message: "Fee effective dates must be unique." });
    if (!account.rates.some((rate) => rate.effectiveDate <= account.openingDate))
      ctx.addIssue({
        code: "custom",
        message: "A rate must be effective on or before the account opens.",
      });
  });
export type Account = z.infer<typeof accountSchema>;

export const transactionSchema = z.object({
  id,
  accountId: id,
  destinationId: z.string().max(100),
  type: z.enum(["deposit", "withdrawal", "transfer"]),
  amount,
  date: day,
  timing: z.enum(["start", "end"]),
  note: z.string().max(300),
});
export type Transaction = z.infer<typeof transactionSchema>;

export const scheduleSchema = z
  .object({
    id,
    accountId: id,
    destinationId: z.string().max(100),
    type: z.enum(["deposit", "withdrawal", "transfer"]),
    amount,
    start: month,
    end: month,
    day: z.number().int().min(1).max(31),
    timing: z.enum(["start", "end"]),
    paused: z.boolean(),
  })
  .refine((schedule) => schedule.start <= schedule.end, "Schedule end must not precede its start.");
export type Schedule = z.infer<typeof scheduleSchema>;

export const goalSchema = z.object({
  enabled: z.boolean(),
  monthlyIncome: amount,
  annualIncome: amount,
  portfolioTarget: amount,
  deadline: z.union([month, z.literal("")]),
  withdrawalAmount: amount,
  withdrawalFrequency: z.enum(["monthly", "annual"]),
  withdrawalStart: month,
  evaluationMonths: z.number().int().min(1).max(600),
  objective: z.enum(["nominal", "real", "drawdown"]),
  inflation: percent,
  inflationEnabled: z.boolean(),
  minimumBalance: amount,
});
export type Goal = z.infer<typeof goalSchema>;

export const baselineSchema = z.object({
  month,
  values: z.record(z.string().max(100), z.string().max(100)),
  mapping: z.record(z.string().max(100), z.string().max(100)),
});
export type BaselineRow = z.infer<typeof baselineSchema>;

export const contributionOverrideSchema = z.object({
  accountId: id,
  month,
  amount,
  day: z.number().int().min(1).max(31),
  timing: z.enum(["start", "end"]),
});
export type ContributionOverride = z.infer<typeof contributionOverrideSchema>;

export const scenarioSchema = z
  .object({
    id,
    name: label,
    currency: z.string().regex(/^[A-Z]{3}$/),
    start: month,
    end: month,
    accounts: z.array(accountSchema).max(30),
    transactions: z.array(transactionSchema).max(10000),
    schedules: z.array(scheduleSchema).max(100),
    contributionOverrides: z.array(contributionOverrideSchema).max(5000).default([]),
    goal: goalSchema,
    baseline: z.array(baselineSchema).max(600),
  })
  .superRefine((scenario, ctx) => {
    const issue = (message: string) => ctx.addIssue({ code: "custom", message });
    if (scenario.start > scenario.end || monthsBetween(scenario.start, scenario.end) >= 600)
      issue("Projection must cover 1 to 600 months.");
    for (const collection of [scenario.accounts, scenario.transactions, scenario.schedules]) {
      if (new Set(collection.map((item) => item.id)).size !== collection.length)
        issue("Record IDs must be unique within their collection.");
    }
    if (new Set(scenario.baseline.map((item) => item.month)).size !== scenario.baseline.length)
      issue("Baseline months must be unique.");
    for (const account of scenario.accounts)
      if (account.currency !== scenario.currency)
        issue("Accounts must use the scenario currency. Currency conversion is not supported.");
    const accounts = new Map(scenario.accounts.map((account) => [account.id, account]));
    const overrideKeys = scenario.contributionOverrides.map(
      (item) => `${item.accountId}:${item.month}`,
    );
    if (new Set(overrideKeys).size !== overrideKeys.length)
      issue("Monthly deposit overrides must be unique.");
    for (const override of scenario.contributionOverrides) {
      const account = accounts.get(override.accountId);
      if (
        !account ||
        `${override.month}-${String(Math.min(override.day, monthDays(override.month))).padStart(2, "0")}` <
          account.openingDate
      )
        issue("A monthly deposit override requires an existing account open on the deposit date.");
    }
    for (const transaction of [...scenario.transactions, ...scenario.schedules]) {
      const account = accounts.get(transaction.accountId);
      if (!account) issue("A transaction or schedule references a missing account.");
      const start =
        "date" in transaction
          ? transaction.date
          : `${transaction.start}-${String(Math.min(transaction.day, monthDays(transaction.start))).padStart(2, "0")}`;
      if (account && start < account.openingDate)
        issue("Transactions and schedules cannot begin before their account opens.");
      if (transaction.type === "transfer") {
        const destination = accounts.get(transaction.destinationId);
        if (!destination || destination.id === transaction.accountId)
          issue("Transfers require a different, existing destination account.");
        if (destination && start < destination.openingDate)
          issue("A transfer cannot precede its destination account's opening date.");
      }
    }
  });
export type Scenario = z.infer<typeof scenarioSchema>;

export const workspaceSchema = z
  .object({
    version: z.literal(1),
    activeId: id,
    scenarios: z.array(scenarioSchema).min(1).max(20),
    preferences: z.object({
      view: z.enum(["compact", "detailed"]),
      accountId: z.string().max(100),
      strategy: z.enum(["interest", "withdrawal"]),
      chartPeriod: z.enum(["monthly", "annual", "all"]),
      visibleColumns: z.array(z.string().max(50)).max(30),
    }),
  })
  .superRefine((workspace, ctx) => {
    if (!workspace.scenarios.some((scenario) => scenario.id === workspace.activeId))
      ctx.addIssue({ code: "custom", message: "The active scenario does not exist." });
    if (
      new Set(workspace.scenarios.map((scenario) => scenario.id)).size !==
      workspace.scenarios.length
    )
      ctx.addIssue({ code: "custom", message: "Scenario IDs must be unique." });
  });
export type Workspace = z.infer<typeof workspaceSchema>;

export function newId(): string {
  return crypto.randomUUID();
}

export function newAccount(start: string, currency = "KES"): Account {
  return {
    id: newId(),
    name: "New account",
    provider: "",
    category: "MMF",
    currency,
    openingBalance: "0",
    openingDate: `${start}-01`,
    status: "active",
    rates: [{ effectiveDate: `${start}-01`, annualNetRate: "0", quotation: "effective" }],
    accrual: "monthly",
    crediting: "monthly",
    payoutPercent: "0",
    monthlyFee: "0",
    feeChanges: [],
    minimumBalance: "0",
    notes: "",
  };
}

export function newScenario(): Scenario {
  return {
    id: newId(),
    name: "Current Plan",
    currency: "KES",
    start: "2026-08",
    end: "2030-12",
    accounts: [],
    transactions: [],
    schedules: [],
    contributionOverrides: [],
    baseline: [],
    goal: {
      enabled: false,
      monthlyIncome: "0",
      annualIncome: "0",
      portfolioTarget: "0",
      deadline: "",
      withdrawalAmount: "0",
      withdrawalFrequency: "monthly",
      withdrawalStart: "2030-12",
      evaluationMonths: 120,
      objective: "nominal",
      inflation: "0",
      inflationEnabled: false,
      minimumBalance: "0",
    },
  };
}

export function newWorkspace(): Workspace {
  const scenario = newScenario();
  return {
    version: 1,
    activeId: scenario.id,
    scenarios: [scenario],
    preferences: {
      view: "compact",
      accountId: "",
      strategy: "interest",
      chartPeriod: "all",
      visibleColumns: ["opening", "interest", "contributions", "withdrawals", "closing"],
    },
  };
}

export function duplicateScenario(source: Scenario, name: string): Scenario {
  return { ...structuredClone(source), id: newId(), name };
}

export function evaluationEnd(start: string, count: number): string {
  return addMonths(start, count - 1);
}
