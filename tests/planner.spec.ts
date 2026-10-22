import { expect, test, type Page } from "@playwright/test";

const KEY = "mmf-studio.workspace.v1";

async function addAccount(page: Page, name = "Synthetic MMF") {
  await page.getByRole("button", { name: "Accounts", exact: true }).click();
  await page.getByRole("button", { name: "+ Add account" }).click();
  const dialog = page.getByRole("dialog", { name: "Account settings" });
  await expect(dialog.getByText("full reinvestment", { exact: true })).toBeVisible();
  await dialog.getByLabel("Account name", { exact: true }).fill(name);
  await dialog.getByLabel("Opening principal (KES)", { exact: true }).fill("100000");
  await dialog.getByLabel("Annual net rate after tax (%)", { exact: true }).fill("12");
  await dialog.getByLabel("Annual quotation", { exact: true }).selectOption("nominal");
  await dialog.getByRole("button", { name: "Save account", exact: true }).click();
  await expect(dialog).not.toBeVisible();
}

test("dated projections, inline edits, undo/redo, rate changes and persistence", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Small decisions. Long-term possibilities." }),
  ).toBeVisible();
  await addAccount(page);
  await page.getByRole("button", { name: "Monthly projection", exact: true }).click();
  const august = page
    .getByRole("row")
    .filter({ has: page.getByRole("rowheader", { name: "Aug 2026" }) });
  await expect(august).toContainText("101,000.00");
  await page.getByRole("spinbutton", { name: "Deposit 2026-08", exact: true }).fill("2000");
  await page.getByRole("heading", { name: "Your monthly plan", exact: true }).click();
  await expect(august).toContainText("103,020.00");
  await page.getByRole("button", { name: "Undo", exact: false }).click();
  await expect(august).toContainText("101,000.00");
  await page.getByRole("button", { name: "Redo", exact: false }).click();
  await expect(august).toContainText("103,020.00");
  await page.getByRole("button", { name: "Accounts", exact: true }).click();
  await page.getByRole("button", { name: "Edit account", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Account settings" });
  await dialog.getByRole("button", { name: "+ Schedule rate change", exact: true }).click();
  await dialog.getByLabel("Rate effective date", { exact: true }).nth(1).fill("2026-09-01");
  await dialog.getByLabel("Annual net rate after tax (%)", { exact: true }).nth(1).fill("6");
  await dialog.getByLabel("Annual quotation", { exact: true }).nth(1).selectOption("nominal");
  await dialog.getByRole("button", { name: "Save account", exact: true }).click();
  await page.getByRole("button", { name: "Monthly projection", exact: true }).click();
  await expect(august).toContainText("103,020.00");
  const september = page
    .getByRole("row")
    .filter({ has: page.getByRole("rowheader", { name: /Sept? 2026/ }) });
  await expect(september).toContainText("515.10");
  await page.reload();
  await expect(page.getByRole("spinbutton", { name: "Deposit 2026-08", exact: true })).toHaveValue(
    "2000.00",
  );
  await expect(september).toContainText("515.10");
  await page.getByRole("button", { name: "Inspect 2026-08", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Calculation audit 2026-08" })).toContainText(
    "tax not deducted again",
  );
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("goals remain optional; strategies and saved scenarios remain isolated", async ({ page }) => {
  await page.goto("/");
  await addAccount(page);
  await page.getByRole("button", { name: "Financial freedom", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Your projection works without a goal" }),
  ).toBeVisible();
  await page.getByLabel("Enable financial freedom goals", { exact: true }).check();
  await page.getByLabel("Target monthly net interest", { exact: true }).fill("1000");
  await page.getByLabel("Target withdrawal amount", { exact: true }).fill("1000");
  await page.getByLabel("Withdrawal start month", { exact: true }).fill("2026-08");
  await page.getByLabel("Evaluation period (months)", { exact: true }).fill("12");
  await page.getByRole("button", { name: "Apply goal settings", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Target capacity reached: 2026-08", exact: true }),
  ).toBeVisible();
  const original = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key)!).scenarios[0],
    KEY,
  );
  await page.getByRole("button", { name: "B · Sustainable withdrawals", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Objective met under these assumptions", exact: true }),
  ).toBeVisible();
  const after = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key)!).scenarios[0],
    KEY,
  );
  expect(after).toEqual(original);
  await page.getByRole("button", { name: "Scenarios", exact: true }).click();
  await page.getByLabel("New scenario name", { exact: true }).fill("Synthetic alternative");
  await page.getByRole("button", { name: "Duplicate scenario", exact: true }).click();
  await expect(page.getByLabel("Active scenario", { exact: true })).toHaveText(
    /Synthetic alternative/,
  );
  await page.getByRole("button", { name: "Accounts", exact: true }).click();
  await page.getByRole("button", { name: "Edit account", exact: true }).click();
  await page.getByLabel("Opening principal (KES)", { exact: true }).fill("200000");
  await page.getByRole("button", { name: "Save account", exact: true }).click();
  const balances = await page.evaluate(
    (key) =>
      JSON.parse(localStorage.getItem(key)!).scenarios.map(
        (item: { accounts: { openingBalance: string }[] }) => item.accounts[0].openingBalance,
      ),
    KEY,
  );
  expect(balances).toEqual(["100000", "200000"]);
});

test("baseline mapping, JSON restore and real Excel export", async ({ page }) => {
  await page.goto("/");
  await addAccount(page);
  await page.getByRole("button", { name: "Data & recovery", exact: true }).click();
  await page.getByRole("button", { name: "Preview supplied five-row sample", exact: true }).click();
  await page.getByLabel("Map Month", { exact: true }).selectOption("month");
  await page.getByLabel("Map Total Balance", { exact: true }).selectOption("balance");
  await page.getByLabel("Map Total Interest", { exact: true }).selectOption("interest");
  await page.getByLabel("Map Deposit", { exact: true }).selectOption("deposit");
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Confirm baseline import", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Preserved baseline · 5 months" })).toBeVisible();
  const downloadEvent = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export Excel workbook", exact: true }).click();
  const download = await downloadEvent;
  expect(download.suggestedFilename()).toBe("mmf-projection.xlsx");
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
  expect(Buffer.concat(chunks).subarray(0, 2).toString()).toBe("PK");
  const backup = await page.evaluate((key) => localStorage.getItem(key)!, KEY);
  const imported = JSON.parse(backup);
  imported.scenarios[0].name = "Restored synthetic workspace";
  await page.getByLabel("Choose JSON backup", { exact: true }).setInputFiles({
    name: "synthetic-backup.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(imported)),
  });
  await expect(page.getByText("1 validated scenarios", { exact: true })).toBeVisible();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Confirm workspace replacement", exact: true }).click();
  await expect(page.getByLabel("Active scenario", { exact: true })).toContainText(
    "Restored synthetic workspace",
  );
  await page.reload();
  await expect(page.getByLabel("Active scenario", { exact: true })).toContainText(
    "Restored synthetic workspace",
  );
});

test("mobile layout and unreadable-data protection", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await addAccount(page);
  await page.getByRole("button", { name: "Monthly projection", exact: true }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.screenshot({ path: "test-results/mobile-projection.png", fullPage: true });
  await page.evaluate((key) => localStorage.setItem(key, "{unreadable"), KEY);
  await page.reload();
  await expect(
    page.getByRole("alert").filter({ hasText: "Saved data could not be read" }),
  ).toContainText("has not been overwritten");
  expect(await page.evaluate((key) => localStorage.getItem(key), KEY)).toBe("{unreadable");
  await page.getByRole("button", { name: "Monthly projection", exact: true }).click();
  await expect(page.getByRole("button", { name: "Apply timeline", exact: true })).toBeDisabled();
});

test("one-off and recurring transaction forms perform real calculations", async ({ page }) => {
  await page.goto("/");
  await addAccount(page);
  await page.getByRole("button", { name: "Transactions", exact: true }).click();
  await page.getByRole("button", { name: "+ Add transaction", exact: true }).click();
  let dialog = page.getByRole("dialog", { name: "Transaction editor" });
  await dialog.getByLabel("Amount (KES)", { exact: true }).fill("10000");
  await dialog.getByLabel("Transaction date", { exact: true }).fill("2026-08-16");
  await dialog.getByRole("button", { name: "Save transaction", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await page.getByLabel("Transaction frequency", { exact: true }).selectOption("recurring");
  await page.getByRole("button", { name: "+ Add transaction", exact: true }).click();
  dialog = page.getByRole("dialog", { name: "Transaction editor" });
  await dialog.getByLabel("Amount (KES)", { exact: true }).fill("500");
  await dialog.getByLabel("Final month (inclusive)", { exact: true }).fill("2026-09");
  await dialog.getByRole("button", { name: "Save transaction", exact: true }).click();
  await page.getByRole("button", { name: "Monthly projection", exact: true }).click();
  const row = page
    .getByRole("row")
    .filter({ has: page.getByRole("rowheader", { name: "Aug 2026" }) });
  await expect(row).toContainText("10,500.00");
  await expect(row).toContainText("1,056.61");
});
