# Deployment guide

This guide describes how to publish MMF Studio for installation on your phone.
Adding this documentation does not deploy the app, create a hosting account, or
purchase anything. The private GitHub repository contains the source code, not a
live installation link.

## Cost and prerequisites

You do not need paid hosting solely to use this app personally. Vercel's
[Hobby plan](https://vercel.com/docs/plans/hobby) is a free option for personal,
noncommercial projects, subject to its terms and usage limits. Check the current
plan before creating the project; this guide does not promise unlimited usage
or recommend a paid trial.

Use the provider's included website address. Buying a domain, adding a paid
database, or configuring an AI/API subscription is unnecessary for this app.
Calculations and saved plans run in the browser.

You need access to the `joanmoturi/mmf-studio` GitHub repository and a personal
hosting account. Export an existing plan as a JSON backup before moving it to
another website address or device.

## Deploy with Vercel

1. Sign in to Vercel and choose a personal Hobby account/project. Avoid selecting
   a paid plan or trial if you intend to remain on the free plan.
2. Add a new project and import `joanmoturi/mmf-studio` from GitHub. If it is not
   listed, review the GitHub integration's repository permissions and grant
   access to this repository. The repository does not need to become public.
3. Configure the build using the settings below.
4. Review the plan and access settings, then select **Deploy** when you are ready
   to publish. This is the step that actually creates a hosted application.
5. After a successful deployment, open its stable production HTTPS address.
   Use that same address for future visits and installation.

| Setting               | Value                                                                       |
| --------------------- | --------------------------------------------------------------------------- |
| Framework preset      | Next.js                                                                     |
| Repository root       | The repository root, where `package.json` is located                        |
| Production branch     | `main`                                                                      |
| Node.js               | 24.x, matching the supported local development runtime                      |
| Install command       | `npm ci`, including development dependencies for the build                  |
| Build command         | `npm run build`                                                             |
| Output directory      | Leave the Next.js preset's default; do not override it to `public` or `out` |
| Environment variables | None required by MMF Studio                                                 |
| Custom domain         | Not required; use the provided production address                           |

**Do not replace the build command with `next build` alone.** The package script
also generates installation icons, the build-pinned offline HTML snapshot, and
the service worker. These generated files are intentionally not committed.

Vercel handles serving the Next.js build; do not configure its deployment to run
the local `npm start` command. That command binds to `127.0.0.1:3001` for local
use. Follow the provider's [build configuration](https://vercel.com/docs/builds/configure-a-build)
and [Git integration](https://vercel.com/docs/git) documentation if its interface
differs from these instructions.

For free private-repository deployment, keep this repository under the personal
GitHub account. Vercel documents restrictions on private organization repositories
and Hobby commit authors. If deployment is blocked, check repository ownership
and the hosting account's linked Git identity before considering any plan change.
Do not change repository visibility just to troubleshoot a failed build.

## Hosting requirements

Other hosts must support the existing Next.js application and its build script.
This project is not configured as a static export; uploading the source ZIP,
publishing only `public`, or selecting GitHub Pages is not a deployment of the
current application.

The host must serve the application at the website root over trusted HTTPS and
include the generated `public` files plus all Next.js runtime assets. Subpath
hosting, such as a project directory beneath another site, is not configured.

Preserve the `/sw.js` headers from `next.config.ts`: JavaScript content type,
no-cache/no-store, and `Service-Worker-Allowed: /`. Do not cache an old worker
indefinitely at a reverse proxy. Manifest, icon, offline HTML, and runtime asset
requests must return the actual files, not an HTML error or sign-in page.

## Verify the hosted app before installing

The repository has local production/browser coverage, but that does not verify a
new hosting provider or actual phone installation. Complete these checks against
your deployment:

1. Open the production HTTPS address and wait for **Ready for offline use**.
2. Confirm `/manifest.webmanifest` returns the MMF Studio manifest and its icon
   addresses load. Confirm `/sw.js` returns JavaScript, not an HTML page.
3. Check the worker response headers. From PowerShell, replace the example
   address below with the actual deployment address:

   ```powershell
   $base = 'https://YOUR-PROJECT.vercel.app'
   curl.exe --fail --silent --show-error --head "$base/sw.js"
   ```

4. Add a temporary account using synthetic values, reload, and confirm it remains.
5. Follow the [phone guide](phone-guide.md) to install, close the app, and reopen
   it in airplane mode. Confirm editing, reload persistence, and file export.
6. Export a JSON backup before importing real financial data.

Use the stable production address, not a different preview URL for each update.
Browser storage is tied to the origin: a new hostname creates a separate
workspace and requires a JSON transfer.

## Privacy and access

A private source repository does not automatically make the deployed website
private. MMF Studio has no application login or server-side financial account API.
Anyone allowed to open the website gets their own browser-local workspace; they
do not automatically receive the plans stored on your phone.

Browser-profile access still exposes local plans, and exported backups contain
financial information. The hosting provider can also receive ordinary website
request metadata. Protect your device and backups. Never commit real plan exports,
hosting credentials, or secrets to the source repository.

If you configure provider-level deployment protection, complete the authorized
sign-in flow and verify that installation and offline asset downloads still work.
Do not bypass access controls to make an installation check pass.

## Publish updates

Before publishing changes, export your current plan and run the repository checks
described in the [README](../README.md#verification). The PWA browser command builds
production and exercises offline behavior; ordinary development mode does not.

With Vercel's Git integration configured, changes pushed to the production branch
can trigger a new deployment. Review its build result before treating the update
as available.

On the phone, reconnect and open the app. When **Apply app update** appears, save
any draft form, export a backup, and confirm the update. It reloads the current
tab and preserves saved financial storage. Recheck **Ready for offline use**
before disconnecting.

If a deployment fails, inspect its build log rather than clearing phone storage.
The cached app may still work offline, but availability depends on the files
remaining on the device. Do not rely on installation as a substitute for backups.
