# Code Documentation Index

Updated September 20, 2026. This pass adds maintainer comments; it does not change application behavior.

Read SYSTEM-OVERVIEW.md for architecture and database context. Comments marked `MAINTAINER GUIDE` identify the notes added in this pass.

## Documented source files

| File | Purpose of the added documentation |
|---|---|
| `backend/monitorBP backend/recordVersion.js` | Opaque loaded-version comparisons and actionable conflict responses; missing versions cannot bypass protection. |
| `backend/monitorBP backend/concurrentEdits.test.cjs` | Real concurrent transactions against a uniquely named disposable database, with exact-name cleanup. |
| `frontend/portal-react/system/tests/concurrent-edits.test.cjs` | Actual workspace controllers retain drafts and loaded versions when the API returns a conflict. |
| `backend/monitorBP backend/peopleProfiles.js` | Session-owned profiles, approved-account directory, hidden built-in ID, session presence and transactional password changes. |
| `frontend/portal-react/system/features/accounts/AccountTools.jsx` | Isolated React dialogs, activity heartbeats and stale-account detection without rerendering legacy pages. |
| `frontend/portal-react/system/assets/permits/account-tools.css` | Scoped, responsive account-panel styles with dark-mode support. |
| [backend/monitorBP backend/monitorServer.js](backend/monitorBP%20backend/monitorServer.js) | Permit API and page server (port 3000). |
| [backend/monitorBP backend/authServer.js](backend/monitorBP%20backend/authServer.js) | Permit account registration, password verification, and account administration. |
| [backend/monitorBP backend/editWorkflow.js](backend/monitorBP%20backend/editWorkflow.js) | Approval lifecycle for proposed permit and routing edits. |
| [backend/monitorBP backend/deletionWorkflow.js](backend/monitorBP%20backend/deletionWorkflow.js) | Whole-project deletion approval workflow for both registries. |
| [backend/monitorBP backend/inspectionWorkflow.js](backend/monitorBP%20backend/inspectionWorkflow.js) | Inspection validation and inspection-only deletion requests. |
| [backend/monitorBP backend/projectChanges.js](backend/monitorBP%20backend/projectChanges.js) | Human-readable descriptions of permit field changes. |
| [backend/monitorBP backend/projectRecords.js](backend/monitorBP%20backend/projectRecords.js) | Per-project remarks and audit records exposed to workspace panels. |
| [backend/monitorBP backend/stationDates.js](backend/monitorBP%20backend/stationDates.js) | Calendar-only Date Checked and Date Approved rules. |
| [backend/monitorBP backend/maintenance/permit-backup.js](backend/monitorBP%20backend/maintenance/permit-backup.js) | Local permit backup and recovery maintenance utility. |
| [backend/queue backend/queueServer.js](backend/queue%20backend/queueServer.js) | Queue API, workstation sessions, media routes, and Socket.IO updates (port 5000). |
| [backend/queue backend/ticket-submission.js](backend/queue%20backend/ticket-submission.js) | Retry-safe queue ticket creation. |
| [frontend/portal-react/system/assets/permits/request-feedback.js](frontend/portal-react/system/assets/permits/request-feedback.js) | Transport errors and uncertain-save recovery shared by permit controllers. |
| [frontend/portal-react/system/assets/permits/form-safety.js](frontend/portal-react/system/assets/permits/form-safety.js) | Client-side form validation, submission locking, and unsaved-change prompts. |
| [frontend/portal-react/system/assets/permits/permit-routing.js](frontend/portal-react/system/assets/permits/permit-routing.js) | Shared permit navigation: operator registry, admin dashboard, superadmin dashboard. |
| [frontend/portal-react/system/assets/permits/project-identity.js](frontend/portal-react/system/assets/permits/project-identity.js) | Stable display formatting for separate building and occupancy primary keys. |
| [frontend/portal-react/system/assets/permits/registry-filters.js](frontend/portal-react/system/assets/permits/registry-filters.js) | Pure registry selection plus per-account view preferences. |
| [frontend/portal-react/system/assets/permits/project-records.js](frontend/portal-react/system/assets/permits/project-records.js) | Workspace Remarks and Logs panel renderer. |
| [frontend/portal-react/system/assets/permits/quick-templates.js](frontend/portal-react/system/assets/permits/quick-templates.js) | Personal building-station shortcuts stored per user in the browser. |
| [frontend/portal-react/system/assets/permits/station-dates.js](frontend/portal-react/system/assets/permits/station-dates.js) | Station date dialog and approval-request interaction. |
| [frontend/portal-react/system/assets/permits/workspace-layout.js](frontend/portal-react/system/assets/permits/workspace-layout.js) | Progressive layout enhancement for the building workspace template disclosure. |
| [frontend/portal-react/system/assets/permits/appearance.js](frontend/portal-react/system/assets/permits/appearance.js) | Shared light/dark preference applied before page content loads. |
| [frontend/portal-react/system/main.jsx](frontend/portal-react/system/main.jsx) | Hybrid React entry point for the permit and queue pages. |
| [frontend/portal-react/system/shared/legacy-attributes.js](frontend/portal-react/system/shared/legacy-attributes.js) | Compatibility bridge for trusted layout attributes and existing inline handlers. |
| [frontend/portal-react/system/publish.mjs](frontend/portal-react/system/publish.mjs) | Publishes system page shells and the compiled React layout bundle to both Express static directories. |
| [frontend/portal-react/publish-local.mjs](frontend/portal-react/publish-local.mjs) | Publishes the standalone portal build to the existing local entry points. |
| [frontend/portal-react/src/main.jsx](frontend/portal-react/src/main.jsx) | Standalone portal UI and links to the two local systems. |
| [frontend/portal-react/system/assets/queue/form-safety.js](frontend/portal-react/system/assets/queue/form-safety.js) | Queue form validation and unsaved-change handling; server validation remains authoritative. |
| [frontend/portal-react/system/assets/queue/request-feedback.js](frontend/portal-react/system/assets/queue/request-feedback.js) | Queue transport errors and uncertain-save recovery; do not blindly retry a state-changing request. |
| [frontend/portal-react/system/assets/queue/appearance.js](frontend/portal-react/system/assets/queue/appearance.js) | Queue light/dark theme synchronization through the shared engineeringTheme preference. |
| [frontend/portal-react/system/features/auth/login.jsx](frontend/portal-react/system/features/auth/login.jsx) | React layout and controller DOM contract. |
| [frontend/portal-react/system/features/auth/login.html](frontend/portal-react/system/features/auth/login.html) | Page assets, initialization order, and classic workflow controllers. |
| [frontend/portal-react/system/features/auth/legacy-occupancy-login.jsx](frontend/portal-react/system/features/auth/legacy-occupancy-login.jsx) | React layout and controller DOM contract. |
| [frontend/portal-react/system/features/auth/legacy-occupancy-login.html](frontend/portal-react/system/features/auth/legacy-occupancy-login.html) | Page assets, initialization order, and classic workflow controllers. |
| [frontend/portal-react/system/features/auth/legacy-admin-login.jsx](frontend/portal-react/system/features/auth/legacy-admin-login.jsx) | React layout and controller DOM contract. |
| [frontend/portal-react/system/features/auth/legacy-admin-login.html](frontend/portal-react/system/features/auth/legacy-admin-login.html) | Page assets, initialization order, and classic workflow controllers. |
| [frontend/portal-react/system/features/building/registry.jsx](frontend/portal-react/system/features/building/registry.jsx) | React layout and controller DOM contract. |
| [frontend/portal-react/system/features/building/registry.html](frontend/portal-react/system/features/building/registry.html) | Page assets, initialization order, and classic workflow controllers. |
| [frontend/portal-react/system/features/occupancy/registry.jsx](frontend/portal-react/system/features/occupancy/registry.jsx) | React layout and controller DOM contract. |
| [frontend/portal-react/system/features/occupancy/registry.html](frontend/portal-react/system/features/occupancy/registry.html) | Page assets, initialization order, and classic workflow controllers. |
| [frontend/portal-react/system/features/building/details.jsx](frontend/portal-react/system/features/building/details.jsx) | React layout and controller DOM contract. |
| [frontend/portal-react/system/features/building/details.html](frontend/portal-react/system/features/building/details.html) | Page assets, initialization order, and classic workflow controllers. |
| [frontend/portal-react/system/features/occupancy/details.jsx](frontend/portal-react/system/features/occupancy/details.jsx) | React layout and controller DOM contract. |
| [frontend/portal-react/system/features/occupancy/details.html](frontend/portal-react/system/features/occupancy/details.html) | Page assets, initialization order, and classic workflow controllers. |
| [frontend/portal-react/system/features/administration/dashboard.jsx](frontend/portal-react/system/features/administration/dashboard.jsx) | React layout and controller DOM contract. |
| [frontend/portal-react/system/features/administration/dashboard.html](frontend/portal-react/system/features/administration/dashboard.html) | Page assets, initialization order, and classic workflow controllers. |
| [frontend/portal-react/system/features/queue/login.jsx](frontend/portal-react/system/features/queue/login.jsx) | React layout and controller DOM contract. |
| [frontend/portal-react/system/features/queue/login.html](frontend/portal-react/system/features/queue/login.html) | Page assets, initialization order, and classic workflow controllers. |
| [frontend/portal-react/system/features/queue/service-desk.jsx](frontend/portal-react/system/features/queue/service-desk.jsx) | React layout and controller DOM contract. |
| [frontend/portal-react/system/features/queue/service-desk.html](frontend/portal-react/system/features/queue/service-desk.html) | Page assets, initialization order, and classic workflow controllers. |
| [frontend/portal-react/system/features/queue/monitor.jsx](frontend/portal-react/system/features/queue/monitor.jsx) | React layout and controller DOM contract. |
| [frontend/portal-react/system/features/queue/monitor.html](frontend/portal-react/system/features/queue/monitor.html) | Page assets, initialization order, and classic workflow controllers. |
| [frontend/portal-react/system/features/queue/audit-logs.jsx](frontend/portal-react/system/features/queue/audit-logs.jsx) | React layout and controller DOM contract. |
| [frontend/portal-react/system/features/queue/audit-logs.html](frontend/portal-react/system/features/queue/audit-logs.html) | Page assets, initialization order, and classic workflow controllers. |
| [frontend/portal-react/system/features/queue/management.jsx](frontend/portal-react/system/features/queue/management.jsx) | React layout and controller DOM contract. |
| [frontend/portal-react/system/features/queue/management.html](frontend/portal-react/system/features/queue/management.html) | Page assets, initialization order, and classic workflow controllers. |

## Editing and publishing

### Main portal: source edits versus the page served by Express

The browser does **not** load `src/main.jsx` directly when viewing the portal through either Express server. It loads the published `portal.html`, which references compiled files such as `portal-assets/assets/index-rSSh1GRJ.js`. The suffix is a build hash, not a permanent filename. These long, minified bundles contain the portal code and its dependencies, including React.

The update flow is:

`src/main.jsx` / `src/style.css` → Vite build → `dist/` → `publish-local.mjs` → published `portal.html` and `portal-assets/` → browser

**To change portal text, layout, or behavior permanently:**

1. Edit the source in `frontend/portal-react/src/` (usually `main.jsx` or `style.css`).
2. Open a terminal in `frontend/portal-react` and run:

   ```powershell
   node node_modules/vite/bin/vite.js build --base=/portal-assets/
   node publish-local.mjs
   ```

   Run the publish command only after the build succeeds. Building alone updates `dist/`; it does not update the files served by Express.

3. Refresh the portal with **Ctrl + F5**.

The publisher updates the root `frontend` portal and the copies in `frontend/monitorBP frontend` and `frontend/queue frontend`. It also removes obsolete publisher-owned hashed assets. Do not manually rename a bundle or hard-code its current hash.

**Why a direct bundle edit can appear to work:** removing text from the specific published JavaScript file the browser loads changes that page immediately after refresh. However, this bypasses the source and is overwritten by a subsequent build/publish. For example, removing “Your Workspace Connected” only from a generated bundle will not survive publication unless the same change is made in the source. Before rebuilding after such a manual edit, transfer the intended change into the source first.

**Development versus published preview:** Vite's development server transforms source edits and refreshes the development page automatically. The Express-served portal uses the last published build. Editing `main.jsx` while viewing Express therefore requires the build/publish steps above. If the old content remains, check the browser's page origin, the loaded asset filename in DevTools Network, and whether publication completed successfully.

The permit/queue React pages use a separate build under `system/`; use the system publishing workflow below for those pages, not the portal commands above.

- Edit React layouts and document controllers under `frontend/portal-react/system/features/`; rebuild the system bundle and run `system/publish.mjs` from `frontend/portal-react`.
- Edit portal source under `frontend/portal-react/src/`; build the portal and run `publish-local.mjs`.
- Shared CSS and browser helpers live in their respective Express frontend folders. Shared copies should be checked together when changing behavior.
- Generated bundles, dependencies, logs, uploads, and historical test fixtures are not hand-documented. Published HTML receives the comments from its source shell.
- Existing UI role checks and identity headers are not a completed security implementation. Security and encryption remain a separately planned phase.

## Queue flow maintenance

- `backend/queue backend/queue-service.js`: documents window ownership, stale ticket protection, serialized transitions, and the additive completed-status startup migration.
- `backend/queue backend/queue-service.test.cjs`: regression coverage with temporary database tables; never resets application tickets.
- `frontend/portal-react/system/features/queue/service-desk.html`: shared pending-action guard, current-ticket display, and explicit completion.
- `frontend/portal-react/system/features/queue/monitor.html`: all-window state and call-stamp announcement tracking. Enable sound uses a user gesture; manually verify audible recall in the actual monitor browser.


## Server-verified permit sessions

- `backend/monitorBP backend/permitSessions.js`: cookie issuance/rotation, hashed session storage, expiry, verified identity, role guards, and write-origin checks.
- `backend/monitorBP backend/permitPages.js`: protected HTML routing and safe injection of the verified UI identity.
- `backend/monitorBP backend/permitSessions.test.cjs`: real HTTP session and direct-page tests using temporary tables.
- `frontend/portal-react/system/assets/permits/permit-routing.js`: API request header, real logout, and history revalidation. sessionStorage is presentation state only.
- Workflow modules now read req.user, never client-provided identity headers; test fixtures explicitly supply verified users.


## Printable project summaries

- `frontend/portal-react/system/features/printing/project-summary.html`: shared preview shell and Print / Save as PDF controls.
- `frontend/portal-react/system/features/printing/project-summary.js`: read-only retrieval through existing authenticated APIs, safe DOM rendering, and template content. Stops printing when any required request fails. Uses the verified session username for the generated-by footer.
- `frontend/portal-react/system/features/printing/project-summary.css`: provisional A4 layout, screen preview, print margins, repeating table headings, and print visibility. Replace this styling and the renderer when a final template is agreed.
- `frontend/portal-react/system/assets/permits/occupancy-checklist.js`: shared document labels used by both occupancy workspace and summary. Keep IDs stable because saved checklist states reference them.
- `frontend/portal-react/system/features/building/details.jsx` and `frontend/portal-react/system/features/occupancy/details.jsx`: Print Summary links opening the preview in a separate tab.
- `frontend/portal-react/system/tests/project-summary.test.cjs`: fixtures covering both kinds, omission of remarks/logs, escaped user text, missing sessions and partial-load failures. Run from portal-react with `node --test system/tests/project-summary.test.cjs`.

Summary assets are authored under system/features/printing and copied to the permit server by system/publish.mjs. All system frontend edits use the build/test/publish workflow. Never edit the generated system-react/app.js bundle.


## Permit workspace sidebar

- `frontend/portal-react/system/shared/PermitSidebar.jsx`: shared React navigation for the two registries and their Details pages. Owns collapse/drawer state only, leaving legacy page DOM and drafts intact. Calls the existing PermitRouting logout handler.
- `frontend/portal-react/system/assets/permits/permit-sidebar.css`: scoped content offsets, theme colors, desktop icon rail, and mobile drawer. Header stays full width; page content keeps normal document scrolling.
- `frontend/portal-react/system/main.jsx`: mounts navigation only for the four operator permit pages.
- `frontend/portal-react/system/tests/permit-sidebar.test.cjs`: checks all four pages, active destinations, preservation of controller-owned drafts, logout wiring, and mobile Escape/focus behavior against the built bundle.

Build the system Vite bundle and run system/publish.mjs after JSX changes. Sidebar CSS is authored under system/assets/permits and copied by the publisher; the four source HTML shells include it after existing styles.


### Review dates and administration navigation
Review-date columns live in both permit Details layouts and controllers, between Status and Remarks. Each date button opens the shared station-dates.js editor, preserving the existing station-dates API, validation, conflict checks, and administrator approval for operator changes. Registry Progress uses StationDates.summary for read-only YYYY-MM-DD labels; missing dates display an em dash. The building registry SQL includes both date fields for parent and sub-permit stations.

PermitSidebar.jsx also serves the admin dashboard: overview, building/occupancy approvals, People, Profile, and logout; only superadmins see account-request and account-management shortcuts. The existing API role restrictions remain authoritative. The sidebar is fixed on desktop and collapses to the existing mobile drawer.


### Safe account-list rendering
The administration dashboard controller builds account-table rows with DOM methods and textContent. Usernames and roles must never be interpolated into HTML strings or inline JavaScript handlers. Account actions bind event listeners with captured numeric IDs; role CSS classes use an allowlist. Delete confirmations receive the original username as plain text. This protects existing stored names as well as new registrations without renaming accounts. Regression coverage: system/tests/admin-accounts.test.cjs (mock data only).
