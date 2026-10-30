# Phone installation, offline use, and backups

MMF Studio is a web app with Progressive Web App (PWA) support. You install it
from its hosted website, not from the GitHub repository, a source ZIP, or an app
store. If there is no live app address yet, follow the
[deployment guide](deployment.md) first.

## Before installing

Open the app's trusted HTTPS address on your phone while connected to the
internet. Use your normal browser, not a private/incognito session or an embedded
browser inside a messaging app.

Wait for **Ready for offline use** above the planner. Do not close the app during
the initial download. A home-screen icon alone does not prove offline setup is
complete.

Your phone's `127.0.0.1` or `localhost` refers to the phone, not your computer.
An ordinary HTTP computer/LAN address is not a trusted phone installation origin.
See MDN's [PWA installation requirements](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable).

## Android with Chrome

1. Open the hosted app directly in Chrome and wait for offline readiness.
2. Select **Install MMF Studio** if the app offers it.
3. Otherwise, open Chrome's menu and select **Install and create shortcut > Install**.
   Some versions label this **Install app** or **Add to Home screen**.
4. Follow the installation prompt, then open the MMF Studio home-screen icon.

The in-app installation button depends on the browser offering a native prompt;
it is not always displayed. Google's [web app installation guide](https://support.google.com/chrome/answer/9658361?co=GENIE.Platform%3DAndroid&hl=en)
describes its current menu.

## iPhone or iPad with Safari

1. Open the hosted app directly in Safari and wait for offline readiness.
2. Open **Share**, then select **Add to Home Screen**.
3. Enable **Open as Web App** when the option is shown, then select **Add**.
4. Open the MMF Studio home-screen icon while still online.

The Chrome-style in-app install button is not required for Safari installation.
Browser and operating-system versions can change menu placement. After launching
the installed app, check readiness there too; its storage may be separate from
the original browser tab.

## Confirm that offline use really works

Use a temporary account with synthetic values before moving real plans:

1. Launch the installed app while online and confirm **Ready for offline use**.
2. Save a temporary account or edit a monthly deposit.
3. Enable airplane mode and ensure Wi-Fi is also off.
4. Close the app, then reopen its home-screen icon.
5. Confirm **Offline** appears and the saved account or edit remains.
6. Make another edit and reload or close/reopen again to verify persistence.
7. Under **Data & recovery**, export a JSON backup. If you use Excel, try its
   export and reference-baseline import while still offline.

Projections, account editing, transactions, saved scenarios, and supported file
operations work on the device after the complete offline download. Internet is
needed for first setup, cache repair, and app updates. Your computer does not
need to remain on.

Automated Chromium and phone-emulated WebKit coverage is not a substitute for
this physical-device check.

## Transfer your existing plan

On the computer, open the app at the exact address where your plan was saved.
Open **Data & recovery** and export a full JSON backup. Transfer that file to your
phone using a method you trust; it contains financial information.

On the phone, launch the app in the context you intend to use, preferably its
installed home-screen icon. Select **Upload JSON backup** beside **Back up plan**
at the top of the app, choose your `.json` file, review the restore preview, and
confirm workspace replacement. You can also use **Data & recovery > Choose JSON
backup**.

**Restoring replaces the current workspace; it does not merge plans.** Export any
existing phone workspace first. After restoration, check account balances,
projection dates, and the active scenario, then close/reopen to confirm the save.

Different devices, browsers, ports, and website addresses have separate storage.
The installed app may also have separate storage from its browser tab. Moving to
the hosted app does not automatically transfer a plan from your computer.
There is no automatic synchronization or account-based cloud backup.

## Choose the right export

| File                      | Purpose                                                                                                |
| ------------------------- | ------------------------------------------------------------------------------------------------------ |
| Full JSON backup          | Supported full-workspace restore, including accounts, transactions, goals, scenarios, and settings     |
| CSV exports               | Monthly/transaction tables for analysis; not a full-plan restore                                       |
| Excel workbook            | Projection table and workspace JSON chunks; use a separate JSON backup for supported full-plan restore |
| CSV/Excel baseline import | Reference data for reconciliation; not account or transaction restoration                              |

Keep regular full JSON backups outside the browser, especially before importing,
updating, switching addresses, clearing site data, or uninstalling. Browser/site
storage may be removed by device storage policies, and installation is not a
backup.

The installation-help panel offers **Request persistent device storage** on
supported browsers. The browser may decline. Approval reduces automatic eviction
risk but does not protect against manual deletion, device loss, or every storage
policy.

## Update the app

Reconnect to the internet and open the installed app. When **Apply app update**
appears, save or cancel open forms and export a backup before confirming.
The app then reloads this tab. Other tabs are not automatically reloaded; close
old tabs when practical.

Updates do not intentionally clear saved financial storage. Wait for **Ready for
offline use** again before disconnecting. If offline files from an old build can
no longer be downloaded, apply the available app update rather than repeatedly
trying to repair that old version.

## Troubleshooting

| Symptom                                                 | Action                                                                                                                |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| No live app address                                     | Publish a production build using the deployment guide; the repository URL is not an installation URL                  |
| No install button                                       | Use the browser's install menu or Safari's Share menu; avoid embedded and private browsers                            |
| "Offline setup requires a production build"             | You opened development mode; use the hosted production app or local `npm run build` followed by `npm start`           |
| "HTTPS and a supported browser required"                | Open the trusted HTTPS website in a supported browser, not an HTTP LAN address                                        |
| "Offline setup incomplete"                              | Reconnect, check device storage, then select **Retry offline setup**; apply an available update if repair still fails |
| Home-screen app is empty but the browser tab has a plan | Export from the original context and restore the JSON in the installed app                                            |
| Plan disappeared after changing URLs                    | Return to the original address and export its JSON; different origins do not share plans                              |
| JSON import would overwrite an existing plan            | Export the current workspace first, then review the replacement preview                                               |
| Unreadable saved data                                   | Use **Data & recovery** to export the unreadable text and inspect recovery options before replacing anything          |
| Changes from another tab block editing                  | Preserve unsaved work, close the other editing tab, and reload after reviewing the conflict                           |
| Installed app fails in airplane mode                    | Reconnect, launch the installed app, finish offline setup, and repeat the physical-device check                       |
| Website requires hosting-provider sign-in               | Complete the authorized sign-in and ask the deployment owner to verify access to worker and runtime files             |

Do not start troubleshooting by clearing site data, deleting browser storage, or
uninstalling. Those actions can remove both the plan and offline files. Export
backups first whenever the app remains accessible.

For account settings, interest conventions, the two financial freedom strategies,
and calculation limitations, see the [README](../README.md#first-use).
