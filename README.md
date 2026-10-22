# MMF Studio

A standalone, local-first investment and financial freedom planner built with
Next.js, strict TypeScript, React, Zod, and Decimal.js. This is a new application
in its own folder; it does not use or modify JOJOBUILDS.

## Documentation

- [Deployment guide](docs/deployment.md): free personal hosting, exact build
  settings, deployment checks, and publishing updates.
- [Phone and backup guide](docs/phone-guide.md): Android/iPhone installation,
  offline checks, transferring plans, recovery, and troubleshooting.
- The sections below cover local setup, financial calculations, privacy,
  application limits, and development verification.

## Run on Windows

Node.js 24 is supported. From PowerShell:

```powershell
Set-Location 'C:\Users\joanmoturi\Downloads\MMF calculator'
npm ci
npm run dev
```

Open `http://127.0.0.1:3001` and use the same address each time. Development and
production both default to port 3001, leaving port 3000 for other projects.
If you previously saved a plan on port 3000, export its JSON backup there and
import it on port 3001; browser storage is separate for each port. For a production
build, run `npm run build` and then `npm start`. Neither command publishes or
deploys anything. Local use needs no application login, credentials, AI API,
backend, or paid service. Online hosting requires a separate hosting account;
see the deployment guide for a free personal-use option.

## Install on your phone

The production app supports home-screen installation and offline use. It has not
been deployed: the private GitHub repository is source code, not a phone
installation link. Publish a production build to a trusted **HTTPS** website
before the first phone installation. Hosting is a separate, explicit action.
Use a host that runs `npm run build`, serves `public` and Next.js runtime assets,
and preserves the configured `/sw.js` response headers. Deploy at the website
root; subpath hosting is not configured.

1. Open the HTTPS app address on your phone while connected to the internet.
   Wait until **Ready for offline use** appears above the planner.
2. **Android / Chrome:** select **Install MMF Studio** when offered, or use the
   browser's install-app menu.
3. **iPhone / iPad:** open the website in Safari, select **Share > Add to Home
   Screen**, enable **Open as Web App** when shown, then select **Add**.
4. Launch the home-screen icon while online once. Confirm it is ready, then try
   airplane mode: close and reopen the app and check that the saved plan appears.

After that complete download, projections, plan editing, scenarios, and JSON,
CSV, and Excel operations work offline without your computer running. Updates
need an internet connection. Your phone's `127.0.0.1` points to the phone, not the
computer. An ordinary HTTP computer/LAN address is not a trusted phone installation
origin; desktop localhost works only for local testing.

To move an existing plan, export its **JSON backup** on the computer and import
that file under **Data & recovery** on the phone. Devices, browsers, website
addresses, and sometimes the installed web-app context have separate storage.
There is no automatic synchronization. If an installed app opens empty, import
the backup there.

Installation is not a backup. Clearing site data, uninstalling, private browsing,
or device storage eviction can remove both plans and offline files. **Request
persistent device storage** asks the browser to reduce automatic eviction; approval
depends on the browser and does not prevent manual clearing. Keep regular JSON
backups outside the app.

### Offline downloads and updates

Offline setup is enabled only in production. The build generates PNG installation
icons and a versioned worker that caches a build-pinned HTML snapshot and all runtime
chunks, including deferred spreadsheet code. Cache repair cannot replace an older
shell with an incompatible newer homepage. **Ready for offline use** verifies
the complete cache, not merely worker registration. An incomplete download or
missing cache is reported; reconnect and select **Retry offline setup**.

New workers wait for approval instead of reloading open forms automatically.
Save drafts, export a backup, and select **Apply app update** when ready. It reloads
this tab only after confirmation and does not migrate or clear financial storage.
The previous application cache is retained for older open tabs' deferred chunks;
unrelated caches are untouched. Close old tabs when practical.

## First use

1. Open **Accounts** and enter your real opening capital, opening date, and
   annual **net interest rate after tax**. No investment balance or market rate
   is prepopulated. KES is the initial currency.
2. Choose the rate quotation, accrual convention, and crediting frequency.
   Interest defaults to full reinvestment. Optional gross/tax fields are references,
   not additional deductions.
3. Add dated deposits, transfers, withdrawals, or recurring schedules under
   **Transactions**. Recurring schedules have first/final months and pause controls.
4. Inspect **Monthly projection**. Change the timeline, expand an account, show
   detailed columns, or inspect a month's calculation audit.
5. Optionally configure **Financial freedom** targets and compare the two strategies.
6. Duplicate a plan or create sensitivity scenarios under **Scenarios**.
7. Export a full JSON backup under **Data & recovery**.

The initial projection window is August 2026 through December 2030. It can be
changed without a new dataset. Limits: 600 months per projection/evaluation,
30 accounts per scenario, 20 scenarios, and 10 MB per imported file.

## Calculation contract

`src\lib\engine.ts` is the single calculation engine used by tables, dashboard
metrics, charts, exports, scenario comparisons, and goal estimates.

- Decimal.js uses 32 significant digits and half-even rounding. Monetary inputs
  and engine outputs are decimal strings, not binary floating-point amounts.
  There is no provider-ledger cent rounding during accrual; display rounds to two
  decimals. Charts convert engine results to numbers only for plotting.
- The operative rate is annual **net after interest tax**. Gross and tax references
  never change that rate automatically. An explicit, confirmed gross-to-net action
  uses `gross * (1 - tax)` and warns the user to verify provider terms.
- Effective annual monthly rate: `(1 + annualNet / 100)^(1/12) - 1`.
  Nominal annual monthly rate: `annualNet / 100 / 12`.
- **Monthly** accrual prorates the monthly factor by actual days in that calendar
  month. Prior-month uncredited interest participates in monthly compounding.
  This is an explicit Actual-Month convention, not a claim about every provider.
- **Daily accrual** uses Actual/Actual for nominal rates. For effective rates,
  it converts the annual factor to the selected crediting period and divides by
  that period's calendar days. Uncredited interest does not compound in this mode.
- **Daily compounding** uses the equivalent effective daily factor or nominal
  annual rate divided by the year's actual days, and compounds pending interest daily.
- **Simple interest** applies the entered annual percentage using Actual/Actual
  without compounding retained interest. Its annual percentage is a simple-yield
  convention, not an effective compounded annual yield.
- Rates apply from their effective dates, including mid-month changes.
  Each daily accrual segment uses the applicable rate.
- Crediting is monthly, calendar-quarter-end, or calendar-year-end.
  Monthly compounding and crediting are separate settings.
- At the start of each day: open any newly available account, then execute
  start-of-day transactions. Accrue interest, credit when due, and charge separate
  monthly fees at month-end. Then execute end-of-day transactions. Strategy
  withdrawals execute last, at month-end, in account-list order.
- Same-day transactions within a timing block run in stable transaction-ID order.
  Use distinct dates/timing blocks if order matters.
- Reinvested interest is a return, not an external deposit or simultaneous cash
  income. Explicit payouts are credited interest followed by an asset withdrawal.
- Transfers never become external contributions. Outgoing amounts are limited by
  account cash and minimum-balance restrictions; unfunded amounts are reported.
  Separately configured fees may consume restricted minimum balances.
- Booked closing balance and accrued-but-uncredited interest remain separate.
  **Total assets** is their sum. Opening balances dated before the projection
  represent opening assets at the projection start, not reconstructed history.
  Later opening capital is shown separately from external contributions.
- Monthly fee inputs mean fees charged **in addition to** the quoted net return.
  Do not enter a fee already included by the provider. Effective-dated fee changes
  apply to month-end charges on or after their chosen dates, not earlier charges.

An account's status does not erase its balance or stop interest accrual.
Inactive/archived accounts pause their recurring schedules; dated one-off
transactions remain explicit instructions.

### Monthly editing

Editable account-deposit cells explicitly override all other external deposits
for that account/month; they do not alter withdrawals or transfers. The override
day and start/end-of-day timing are visible above the table. Reset an override
under Transactions to restore the original deposits.

Paste two spreadsheet columns, `YYYY-MM` and `Amount`, into the monthly table to
set several overrides. Regular cell editing supports Tab, Enter, and Escape.
Other calculated figures cannot be silently overwritten; use explicit dated
transactions, rate changes, or opening-balance reconciliation.

Undo/redo retains the last 30 workspace edits in memory. Reload clears undo
history, but the preceding saved revision remains in browser storage.

## Financial freedom strategies

Goals are optional. Zero targets mean unset; several positive income/balance
targets must all be met.

**A - Net interest income:** evaluates each month-end portfolio using a forward
12-month engine branch with full interest payout, existing accrued interest,
scheduled net rates, separate fees, no future deposits, and no later account openings.
It reports observed period interest separately from next-month income capacity and
the forward-year amount. The latter is not one month multiplied by twelve or a
guaranteed income. Accumulation settings are not modified.

**B - Sustainable withdrawals:** starts from the prior accumulation month's exact
account states, including uncredited interest. It retains scheduled deposits and
existing planned transactions, reinvests interest, and adds explicit strategy
withdrawals. Annual withdrawals occur once per year in the configured start month;
their monthly equivalent is not described as cash actually received each month.

Nominal preservation compares every month-end against starting portfolio assets
plus later account-opening capital. Inflation-adjusted preservation inflates that
benchmark with monthly effective inflation; later opening capital is inflated
from its introduction. Contributions during evaluation are disclosed separately
and may fund withdrawals. Growing/stable/declining uses a 0.01 currency-unit
tolerance. Failed objectives, shortfalls, minimum breaches, and depletion are
reported. Depletion means total assets reach zero within display precision.

Decision estimates are calculated on demand and invalidated when assumptions
change. Funding estimates solve at the configured deadline using the first active
account. Required-capital estimates use current account weights (equal if
unfunded), the selected start date and evaluation period, and **no future external
contributions**. Search is bounded at one trillion; no feasible solution is reported
as such. A passing projection is not a safe withdrawal-rate guarantee.

The earliest withdrawal financial freedom search includes the projection start
itself and excludes external deposits after each candidate date. The selected
withdrawal scenario may still show ongoing deposits, with that dependency disclosed;
it is not treated as portfolio-funded financial freedom merely because those
deposits cover withdrawals.

## Persistence, recovery, and privacy

All financial data stays in this browser's localStorage. There is no network
account-data API, telemetry integration, authentication, cross-device sync, or
encryption-at-rest feature. Anyone with access to the browser profile can access
its plans. Use a private device/profile and protect exported files.

Storage is origin-specific: `localhost`, `127.0.0.1`, and different ports have
separate workspaces. Private/incognito storage may disappear when the window closes.

Every edit validates the entire workspace, retains the preceding valid revision,
and saves before displaying success. Quota/security errors are surfaced. Unreadable
saved data is not silently replaced. Data & recovery exports raw saved text,
restores the preceding revision, or validates and previews a JSON restore.
Recovery preserves original text under a separate recovery key. Changes detected
from another browser tab block editing to avoid silently overwriting its work.

Full JSON backups restore accounts, transactions, schedules, overrides, goals,
scenarios, assumptions, preferences, and baseline data. CSV exports include monthly
and transaction tables. XLSX export contains the table and ordered full-workspace
JSON chunks in a second sheet; use a JSON backup for supported full-plan restore.
XLSX/CSV imports are reference-baseline imports, not transaction-ledger restores.
XLSX baseline import reads the first worksheet only.

CSV spreadsheet-formula prefixes are neutralized on export. No financial data is
sent to third-party services. Public hosting, multi-user access controls, bank
connections, and live market/tax feeds are outside this local application.

## Baseline reconciliation

Only the five supplied August-December 2026 sample rows are bundled, behind an
explicit preview/import action. The full baseline through December 2030 was not
provided and is not invented.

Map columns manually. The ambiguous `IFB -> A D` label is not treated as an account.
Original source values remain available even for unmapped columns. Preview reports
invalid amounts, dates, duplicate/missing months, negative balances, and inconsistent
mapped interest totals. Imports never allocate money or change opening capital.

Use **Inspect** on a matching projection month to compare its calculated assets
with the preserved baseline balance. No exact spreadsheet-match claim is made
without confirmed opening balances, account mappings, rates, and timing rules.

## Verification

```powershell
npm test
npm run typecheck
npm run lint
npm run format:check
npm run build
npm run test:e2e
npm run test:e2e:pwa
```

If Playwright reports a missing Chromium binary, run
`npx playwright install chromium`, then rerun the browser tests. Tests use synthetic
data in isolated browser contexts and an owned development server on port 3317.
They do not read or modify your normal browser workspace.

The PWA command builds production and starts an owned server on port 3318. It runs
Chromium and phone-emulated WebKit; if WebKit is missing, run
`npx playwright install webkit`. These checks cover install metadata, a cold
offline launch, saved-plan edits, deferred Excel features, JSON restore, cache
repair, and deliberately approved updates. Worker unit tests cover failed
downloads, immutable cached shells, cache retention, and same-origin messages.
Automated emulation does not verify the operating system's actual installation
UI: perform the online/home-screen/airplane-mode check on your physical phone.

Unit tests use independently derived expectations, including mathematical
effective/nominal conversions, hand-calculated prorated deposits, transfers,
withdrawals, inflation, and depletion. Browser tests cover real forms, table edits,
undo/redo, dated rate changes, reload persistence, separate strategies/scenarios,
baseline mapping, actual XLSX output, JSON restore, mobile layout, and unreadable
saved-data protection.

## Explicit boundaries

- One currency per scenario; no silent foreign-exchange conversion.
- No assumed provider rates, tax law, opening capital, or guaranteed returns.
- Negative rates and borrowing/overdraft balances are not modeled.
- Gross/tax amounts remain unavailable unless explicitly supplied/reconciled;
  net-rate interest is never taxed again.
- Advanced provider-specific holiday calendars, settlement lags, fee schedules,
  and statutory rounding rules need explicit product-specific extensions.
- At the maximum horizon/account count, detailed projections and on-demand decision
  searches can take longer; this version calculates in the browser main thread.
- A single configured goal set is supported per independent scenario.
- No deployment, paid resource, or external integration is performed automatically.
