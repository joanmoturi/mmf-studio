import { expect, test, type Page } from "@playwright/test";

const KEY = "mmf-studio.workspace.v1";
const phoneRegion = (page: Page) =>
  page.getByRole("region", { name: "Phone installation and offline status" });

async function ready(page: Page) {
  await expect(
    phoneRegion(page).getByText("Online · Ready for offline use", { exact: true }),
  ).toBeVisible();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
}

async function syntheticAccount(page: Page) {
  await page.getByRole("button", { name: "Accounts", exact: true }).click();
  await page.getByRole("button", { name: "+ Add account" }).click();
  const dialog = page.getByRole("dialog", { name: "Account settings" });
  await dialog.getByLabel("Account name", { exact: true }).fill("Synthetic offline MMF");
  await dialog.getByLabel("Opening principal (KES)", { exact: true }).fill("100000");
  await dialog.getByLabel("Annual net rate after tax (%)", { exact: true }).fill("12");
  await dialog.getByLabel("Annual quotation", { exact: true }).selectOption("nominal");
  await dialog.getByRole("button", { name: "Save account", exact: true }).click();
  await expect(dialog).not.toBeVisible();
}

test("phone manifest, icons and worker responses support secure installation", async ({
  page,
  browserName,
  context,
}) => {
  await page.goto("/");
  await ready(page);
  const response = await page.request.get("/manifest.webmanifest");
  expect(response.ok()).toBe(true);
  expect(response.headers()["content-type"]).toContain("application/manifest+json");
  const manifest: { icons: { src: string; sizes: string; purpose: string }[] } =
    await response.json();
  expect(manifest).toMatchObject({
    name: "MMF Studio",
    id: "/",
    start_url: "/",
    scope: "/",
    display: "standalone",
  });
  for (const icon of manifest.icons) {
    const image = await page.request.get(icon.src);
    expect(image.headers()["content-type"]).toContain("image/png");
    const png = await image.body();
    expect(png.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    expect(`${png.readUInt32BE(16)}x${png.readUInt32BE(20)}`).toBe(icon.sizes);
  }
  const worker = await page.request.get("/sw.js");
  expect(worker.headers()["content-type"]).toContain("application/javascript");
  expect(worker.headers()["cache-control"]).toContain("no-store");
  expect(worker.headers()["service-worker-allowed"]).toBe("/");
  await expect(page.locator("link[rel='apple-touch-icon']")).toHaveAttribute(
    "href",
    "/icons/apple-touch-icon.png",
  );
  if (browserName === "chromium") {
    const session = await context.newCDPSession(page);
    const manifestResult = await session.send("Page.getAppManifest");
    expect(manifestResult.errors).toEqual([]);
    const installability = await session.send("Page.getInstallabilityErrors");
    expect(installability.installabilityErrors).toEqual([]);
  }
});

test("a fresh offline launch edits and restores plans and loads deferred spreadsheet features", async ({
  page,
  context,
  browserName,
}, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await ready(page);
  await syntheticAccount(page);
  const saved = await page.evaluate((key) => localStorage.getItem(key)!, KEY);
  if (browserName === "chromium") {
    const session = await context.newCDPSession(page);
    await session.send("Network.clearBrowserCache");
  }
  await page.close();
  await context.setOffline(true);
  const offline = await context.newPage();
  offline.on("pageerror", (error) => errors.push(error.message));
  await offline.goto("/?launch=home-screen");
  await expect(
    phoneRegion(offline).getByText("Offline · Ready for offline use", { exact: true }),
  ).toBeVisible();
  expect(await offline.evaluate((key) => localStorage.getItem(key), KEY)).toBe(saved);
  const first = offline
    .getByRole("row")
    .filter({ has: offline.getByRole("rowheader", { name: "Aug 2026" }) });
  await expect(first).toContainText("101,000.00");
  await offline.getByRole("spinbutton", { name: "Deposit 2026-08", exact: true }).fill("2000");
  await offline.getByRole("heading", { name: "Your monthly plan", exact: true }).click();
  await expect(first).toContainText("103,020.00");
  await offline.reload();
  await expect(
    offline.getByRole("spinbutton", { name: "Deposit 2026-08", exact: true }),
  ).toHaveValue("2000.00");
  await offline.getByRole("button", { name: "Data & recovery", exact: true }).click();
  const workbookEvent = offline.waitForEvent("download");
  await offline.getByRole("button", { name: "Export Excel workbook", exact: true }).click();
  const workbook = await workbookEvent;
  const workbookPath = testInfo.outputPath("synthetic-offline.xlsx");
  await workbook.saveAs(workbookPath);
  await offline
    .getByLabel("Choose CSV or Excel baseline", { exact: true })
    .setInputFiles(workbookPath);
  await expect(offline.getByLabel("Map Month", { exact: true })).toBeVisible();
  await offline.getByRole("button", { name: "Cancel import", exact: true }).click();
  const restored = JSON.parse(saved);
  restored.scenarios[0].name = "Offline restored scenario";
  await offline.getByLabel("Choose JSON backup", { exact: true }).setInputFiles({
    name: "synthetic-offline-backup.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(restored)),
  });
  offline.once("dialog", (dialog) => dialog.accept());
  await offline.getByRole("button", { name: "Confirm workspace replacement", exact: true }).click();
  await offline.reload();
  await expect(offline.getByLabel("Active scenario", { exact: true })).toContainText(
    "Offline restored scenario",
  );
  expect(errors).toEqual([]);
});

test("retry recovers when the first offline download fails before activation", async ({
  page,
  context,
  browserName,
}) => {
  test.skip(browserName !== "chromium", "Service-worker network interception requires Chromium.");
  await context.route("**/manifest.webmanifest", (route) => route.abort());
  await page.goto("/");
  await expect(
    phoneRegion(page).getByText("Online · Offline setup incomplete", { exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(async () => !!(await navigator.serviceWorker.getRegistration("/"))?.active),
  ).toBe(false);
  await context.unroute("**/manifest.webmanifest");
  await phoneRegion(page).getByRole("button", { name: "Retry offline setup", exact: true }).click();
  await ready(page);
  await context.setOffline(true);
  await page.reload();
  await expect(
    phoneRegion(page).getByText("Offline · Ready for offline use", { exact: true }),
  ).toBeVisible();
});

test("cache loss is reported honestly and retry preserves the saved plan", async ({
  page,
  context,
}) => {
  await page.goto("/");
  await ready(page);
  await syntheticAccount(page);
  const saved = await page.evaluate((key) => localStorage.getItem(key), KEY);
  await page.evaluate(async () => {
    for (const name of await caches.keys())
      if (name.startsWith("mmf-studio-shell-")) await caches.delete(name);
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect(
    phoneRegion(page).getByText("Online · Offline setup incomplete", { exact: true }),
  ).toBeVisible();
  await context.route("**/", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<!doctype html><title>Incompatible newer deployment</title>",
    }),
  );
  await phoneRegion(page).getByRole("button", { name: "Retry offline setup", exact: true }).click();
  await ready(page);
  expect(await page.evaluate((key) => localStorage.getItem(key), KEY)).toBe(saved);
  await context.unroute("**/");
  await context.setOffline(true);
  await page.reload();
  await expect(
    phoneRegion(page).getByText("Offline · Ready for offline use", { exact: true }),
  ).toBeVisible();
  expect(await page.evaluate((key) => localStorage.getItem(key), KEY)).toBe(saved);
});

test("updates wait for approval and preserve plans instead of reloading open forms", async ({
  page,
}) => {
  await page.goto("/");
  await ready(page);
  await syntheticAccount(page);
  const saved = await page.evaluate((key) => localStorage.getItem(key), KEY);
  await page.getByRole("button", { name: "Edit account", exact: true }).click();
  await page.getByLabel("Account name", { exact: true }).fill("Unsaved synthetic draft");
  await page.evaluate(async () => {
    await navigator.serviceWorker.register("/sw.js?update-workflow-test=1", {
      scope: "/",
      updateViaCache: "none",
    });
  });
  await expect(
    phoneRegion(page).getByRole("button", { name: "Apply app update", exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Account name", { exact: true })).toHaveValue(
    "Unsaved synthetic draft",
  );
  expect(await page.evaluate((key) => localStorage.getItem(key), KEY)).toBe(saved);
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  page.once("dialog", (dialog) => dialog.accept());
  await Promise.all([
    page.waitForEvent("load"),
    phoneRegion(page).getByRole("button", { name: "Apply app update", exact: true }).click(),
  ]);
  await ready(page);
  expect(await page.evaluate((key) => localStorage.getItem(key), KEY)).toBe(saved);
  await expect(page.getByRole("dialog")).toHaveCount(0);
});
