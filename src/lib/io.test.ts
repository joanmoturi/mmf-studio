import { describe, expect, it } from "vitest";
import { makeCsv, parseCsv, previewBaseline, SAMPLE_BASELINE } from "./io";
import { newWorkspace } from "./model";
import { BACKUP_KEY, loadWorkspace, parseWorkspace, saveWorkspace, STORAGE_KEY } from "./storage";

function storage() {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
  };
}

describe("persistence and import/export", () => {
  it("round-trips all assumptions and maintains a previous revision", () => {
    const store = storage();
    const workspace = newWorkspace();
    saveWorkspace(store, workspace);
    const previous = JSON.stringify(workspace);
    workspace.scenarios[0].name = "Edited";
    saveWorkspace(store, workspace);
    expect(loadWorkspace(store).workspace).toEqual(workspace);
    expect(JSON.parse(store.getItem(BACKUP_KEY)!)).toEqual(JSON.parse(previous));
    expect(parseWorkspace(JSON.stringify(workspace))).toEqual(workspace);
  });

  it("never overwrites unreadable saved data", () => {
    const store = storage();
    store.setItem(STORAGE_KEY, "{broken");
    expect(loadWorkspace(store).blocked).toBe(true);
    expect(() => saveWorkspace(store, newWorkspace())).toThrow();
    expect(store.getItem(STORAGE_KEY)).toBe("{broken");
  });

  it("retains the primary and recovery revision when a new save hits storage quota", () => {
    const store = storage();
    const workspace = newWorkspace();
    saveWorkspace(store, workspace);
    const previous = store.getItem(STORAGE_KEY)!;
    workspace.scenarios[0].name = "Unsaved edit";
    const quotaStorage = {
      getItem: store.getItem,
      setItem: (key: string, value: string) => {
        if (key === STORAGE_KEY) throw new Error("Quota exceeded");
        store.setItem(key, value);
      },
    };
    expect(() => saveWorkspace(quotaStorage, workspace)).toThrow("Quota exceeded");
    expect(store.getItem(STORAGE_KEY)).toBe(previous);
    expect(store.getItem(BACKUP_KEY)).toBe(previous);
  });

  it("preserves all sample figures without guessing transfer meaning", () => {
    const data = parseCsv(SAMPLE_BASELINE);
    const preview = previewBaseline(data, {
      Month: "month",
      "Total Balance": "balance",
      "Total Interest": "interest",
      Deposit: "deposit",
    });
    expect(preview.errors).toEqual([]);
    expect(preview.rows).toHaveLength(5);
    expect(preview.rows[0].values["Total Balance"]).toBe("9098143");
    expect(preview.rows[0].values["IFB → A D"]).toBe("20286");
    expect(preview.rows[4].month).toBe("2026-12");
    expect(preview.warnings.length).toBeGreaterThan(0);
  });

  it("reports duplicates, invalid amounts, missing months and mismatched totals", () => {
    const data = parseCsv(
      "Month,A,Interest,Balance\nJan 2027,10,12,100\nMar 2027,20,20,-5\nMar 2027,abc,20,100",
    );
    const preview = previewBaseline(data, {
      Month: "month",
      A: "account:a",
      Interest: "interest",
      Balance: "balance",
    });
    expect(preview.errors.join(" ")).toMatch(/Duplicate/);
    expect(preview.errors.join(" ")).toMatch(/negative balance/);
    expect(preview.errors.join(" ")).toMatch(/not a valid number/);
    expect(preview.warnings.join(" ")).toMatch(/Missing months/);
    expect(preview.warnings.join(" ")).toMatch(/differs/);
  });

  it("neutralizes spreadsheet formula cells and preserves quoted amounts", () => {
    const text = makeCsv(
      ["Name", "Amount"],
      [
        ['=HYPERLINK("bad")', "1,000"],
        ["Normal", "-123.4"],
      ],
    );
    const data = parseCsv(text);
    expect(data.rows[0][0]).toBe('\'=HYPERLINK("bad")');
    expect(data.rows[0][1]).toBe("1,000");
    expect(data.rows[1][1]).toBe("-123.4");
  });
});
