# Office of the City Engineer — System Overview

For the file-by-file maintainer comment map, see [CODE-DOCUMENTATION.md](CODE-DOCUMENTATION.md).
For a new office host with empty PostgreSQL databases, see the [IT handoff guide](docs/it-handoff.md).

The application runs on PostgreSQL. The dated implementation notes and September
schema appendix document earlier releases. Use the [PostgreSQL migration
guide](POSTGRES-MIGRATION.md) for the cutover and [PostgreSQL backup and
recovery](POSTGRES-BACKUP-RECOVERY.md) for current backup instructions.

## 1. What this project is

### Office identity row (October 5, 2026)

The navy header background and gold divider have been removed across the portal,
permit pages and queue pages. Logo, office identity, Philippine clock and theme
toggle retain their existing behavior. Shared system styling lives in
`frontend/portal-react/system/assets/common/shared-header.css` and
`appearance.css`; the standalone portal uses `frontend/portal-react/src/style.css`.
Fixed permit navigation uses the page background behind this row so scrolling
content does not cover the controls. Publish system and portal styles with
`npm.cmd run publish:system` and `npm.cmd run publish:local`, respectively.

All permit registries, routing workspaces and administrator consoles now use the
same full-height desktop sidebar, with their page title and office seal in the
navigation rail. The clock and page controls remain above the content. Mobile
navigation remains a drawer. Registry, workspace, administration, queue and portal
introductions use rounded panels without the decorative yellow dash. Permit
layout rules live in `system/assets/permits/permit-sidebar.css`, and queue rules
live in `system/assets/queue/queue-workspace.css` under the React frontend source.

### Queue entry flow

The portal opens `/log-in.html`, a dedicated queue username/password page.
Successful sign-in opens `/workstations.html`; that route checks the queue cookie
on the server and redirects anonymous visitors to login. Workstation selection
no longer contains a credential form. Window selection still uses the existing
authenticated lease API. Logout on the selection page invalidates the queue session.
Direct kiosk and monitor URLs remain public for unattended devices. Audit logs
require staff permissions. The public queue feed omits client names and contact
details. The monitor displays tickets and announces calls. Former playlist
bookmarks lead to the workstation chooser.

Edit `frontend/portal-react/system/features/queue/login.jsx` for both layouts and
the companion `login.html` for styles/controllers. The publisher copies this shell
to both URLs, and the layout chooses the screen by pathname. Run
`npm.cmd run publish:system` from `frontend/portal-react`; restart the queue backend
after changing its route guard. Existing permit login behavior is unchanged.

### Permit entry flow (updated September 20, 2026)

The Permit service sends `/` to the public portal at `/portal.html`. The Permit Management card opens `/login`, a shared login for staff accounts. Sign-in creates a server-side session and keeps `oboUser` in sessionStorage as a UI cache. Operators open `/index.html` for the Building registry, with Occupancy available in the sidebar. Admins open `/admin` and Superadmins open `/superadmin`. Only Superadmins manage accounts. Logout returns to the shared login.

`permit-routing.js` centralizes frontend navigation, server logout, same-origin API request headers, and history-restoration checks. `permitSessions.js` authenticates API requests using an HttpOnly cookie. `permitPages.js` guards workspace and dashboard URLs and seeds the verified UI identity before controllers run. The Permit database schema supplies the session tables before startup.

This is a local office application containing a systems portal, building and occupancy permit management, permit administration, and queue management. It uses two independent Express servers and two PostgreSQL databases. The portal links the systems together; it does not merge their databases. The old MariaDB databases are retained only for rollback and are not synchronized.

The frontend is a **hybrid React application**. The portal uses React for its layout and interactive state. Permit and Queue pages use React for their initial layouts, while JavaScript controllers handle forms, table rendering, approvals, validation, and queue updates.

## 2. Technology stack

### Project identifiers

Building and occupancy records display independent project references. The shared
`frontend/portal-react/system/assets/permits/project-identity.js` formatter
prefixes each positive database primary key with `BP-` or `OP-`. PostgreSQL
identity columns in `permits` and `occupancy_permits` allocate the numbers
independently. For example, occupancy ID 6 displays as `OP-6`. Normal edits and
deletion preserve the identifiers of other records. Gaps are expected. The
checked-in schema starts at `BP-53`, `OP-7`, and `TKT-1014` on new databases.
An active queue reset restarts the ticket sequence at `TKT-1001` and archives
the old tickets. [IT handoff guide](docs/it-handoff.md)

References appear in both registries and workspace details and are included in registry search. They are read-only display identifiers; API routes and foreign keys continue using numeric IDs. The occupancy BP Reference field remains separate and is not automatically linked to a building permit by this feature. Sub-permits remain under their existing parent project. Numbering and search checks run with `node --test "frontend/portal-react/system/tests/project-identity.test.cjs" "frontend/portal-react/system/tests/registry-filters.test.cjs"`.

| Layer | Current technology | Responsibility |
|---|---|---|
| Page layouts | React 19, JSX | Portal, Permit and Queue layouts |
| Build tool | Vite 8 | Compiles React into browser JavaScript |
| Portal styling | Tailwind CSS 4 plus custom CSS | Portal layout, colors, responsive styling |
| Other page styling | Existing custom CSS | Preserves established permit and queue designs |
| Portal components | Lucide React, Radix Slot, class-variance-authority, clsx, tailwind-merge | Icons and a small reusable button component |
| Workflow interaction | Existing vanilla JavaScript | Forms, HTTP requests, tables, dialogs and live updates |
| Server runtime | Node.js | Runs both backends and maintenance tools |
| Backend framework | Express 4 | Static pages and JSON APIs |
| Database | PostgreSQL 18.6 | Persistent application records |
| SQL access | pg through backend/database | Compatibility adapter, pools and transactions; mysql2 retained for migration/rollback |
| Realtime queue transport | Socket.IO 4 | Broadcasts queue changes |
| Permit password hashing | bcryptjs | Hashing and checking account passwords |
| Testing | Node test runner; jsdom for React layout checks | Workflow safeguards and DOM compatibility |

This project does not use Next.js, Angular, Vue, TypeScript, Prisma, or a full shadcn/ui installation. The portal button is shadcn-style, using Radix and utility classes. Exact dependency versions are recorded in each package-lock.json; package.json contains the allowed version ranges.

## 3. Runtime architecture

```text
Browser
  |
  +-- Portal (React) -- links to both systems
  |
  +-- Permit UI / HTTP APIs :3000
  |      monitorServer.js + auth/workflow modules
  |                  |
  |             permit_system_migration (PostgreSQL)
  |
  +-- Queue UI / HTTP APIs :5000
         queueServer.js + ticket submission module
                    |
               queue_system_migration (PostgreSQL)
                    |
         Socket.IO broadcasts to queue screens
```

| Service | Entry point | Default address | Database |
|---|---|---|---|
| Permit backend | backend/monitorBP backend/monitorServer.js | http://localhost:3000 | permit_system_migration |
| Queue backend | backend/queue backend/queueServer.js | http://localhost:5000 | queue_system_migration |
| Portal development preview | frontend/portal-react, npm run dev | http://127.0.0.1:5173 | None directly |

The normal application does **not** require Vite to be running. Both Express servers serve already-built frontend files. The portal's online badges check whether existing entry pages respond to HTTP; they do not verify database health.

## 4. Directory map and source ownership

```text
OJT Projects Final/
  SYSTEM-OVERVIEW.md
  backend/
    monitorBP backend/       Permit server, workflows, tests, backup tools
    queue backend/           Queue server, submission safeguards, tests
  frontend/
    portal.html              Generated main portal entry
    portal-assets/           Published portal assets for the root entry
    monitorBP frontend/      Served permit HTML, shared CSS/JS, images
      portal-assets/         Published portal build
      system-react/app.js    Published system layout bundle
    queue frontend/          Served queue HTML, CSS/JS, images, uploads
      portal-assets/         Published portal build
      system-react/app.js    Published system layout bundle
    portal-react/            Frontend source and build project
      src/                   Portal React source and CSS
      public/assets/         Source portal images
      dist/                  Rebuildable portal output
      publish-local.mjs      Publishes portal and prunes old hashed bundles
      system/
        features/            Building, occupancy, auth, administration, queue, printing
        shared/              Sidebar and legacy attribute bridge
        assets/common/       Identical browser assets authored once
        assets/permits/       Permit CSS and browser helpers
        assets/queue/         Queue CSS and browser helpers
        tests/               Automated frontend checks and fixtures
        reference/           Historical pre-React files, not active sources
        main.jsx             Synchronous layout mount
        manifest.json        Feature source to public page mapping
        assets-manifest.json Shared asset source to public URL mapping
        publish.mjs          Publishes bundle, HTML and authored assets
        README.md            Frontend maintenance instructions
      system-dist/app.js     Rebuildable system bundle
```

### Where to edit

| Change | Edit here | Afterwards |
|---|---|---|
| Portal UI or behavior | portal-react/src/main.jsx, src/style.css, src/components | Build and publish portal |
| Permit/queue page markup | portal-react/system/features/<feature>/*.jsx | Build, test and publish system |
| Existing inline page controller or head styles | portal-react/system/features/<feature>/*.html | Publish system after validation |
| Shared styling and shared scripts | portal-react/system/assets/common, permits or queue | Publish system, then refresh |
| Permit business rules | backend/monitorBP backend modules | Test and restart permit server when appropriate |
| Queue business rules | backend/queue backend modules | Test and restart queue server when appropriate |

Do not maintain the generated live HTML separately: the next publish overwrites it. Source shells and served HTML are intentionally separate, not useless duplicates. The publisher now copies common assets from one authored source to both static roots. System-specific helpers remain separate when their contents differ. Images and uploaded media remain in their existing runtime locations.

For the main portal, Express serves the published hashed JavaScript bundle, not `src/main.jsx` directly. Source edits require a successful Vite build followed by `publish-local.mjs`; direct edits to `index-<hash>.js` are temporary and will be overwritten. See [Main portal: source edits versus the page served by Express](CODE-DOCUMENTATION.md#main-portal-source-edits-versus-the-page-served-by-express) for exact commands, development-server behavior, and stale-content troubleshooting.

## 5. Page inventory

| System | Page / URL | Purpose |
|---|---|---|
| Shared | :5000/portal.html; also :3000/portal.html | Systems portal |
| Permit | /permit-access.html | Retired chooser URL; redirects to the signed-in role’s home or login |
| Permit | /login or /login.html | Building operator sign-in and account request |
| Permit | /occupancy_login.html | Occupancy operator sign-in and account request |
| Permit | /admin-login.html | Administrator/superadministrator sign-in |
| Building | /index.html | Registry, search/filter, creation, progress and details |
| Building | /edit?id=... or /edit.html?id=... | Project workspace |
| Occupancy | /occupancy or /occupancy.html | Occupancy registry |
| Occupancy | /occupancy/edit?id=... or /occupancy_edit.html?id=... | Clearance/inspection workspace |
| Administration | /admin | Permit requests, final review, and reports |
| Administration | /superadmin or /superadmin.html | Account requests and administration |
| Queue | /log-in.html | Staff sign-in |
| Queue | /workstations.html | Workstation selection and staff tools |
| Queue | /kiosk.html | Registration and clerk workspaces |
| Queue | /monitor.html | Public queue display and spoken ticket calls |
| Queue | /audit-logs.html | Queue activity viewer |
| Queue | /client-history.html | Service Summary with issued ticket counts |
| Queue | /reports.html | Queue Reports |

The former Queue playlist URL `/secret-management.html` redirects to
`/workstations.html`. The workstation chooser requires a staff session.

## 6. Main user workflows

### Building permits

The registry provides combined search, status/date filtering and sorting. Users can create a project with owner, designer, location, filing date and lots, then open its workspace. A project can contain a main permit and sub-permits with routing stations. Progress shows station status, station-date controls and shared Remarks; Details/workspace includes Logs.

Operators can manage their quick-add station templates. These personal templates live in browser storage, not a shared database catalogue. Location suggestions include barangay names/numbers, while custom typed locations remain allowed.

### Occupancy permits

The registry stores a building-permit reference, project, owner, location and application date. The workspace includes routing stations, inspections and a documentary checklist. Its BP reference is text, not an enforced foreign key to a building permit. Station templates, Remarks, Logs and station-date controls follow the occupancy workflow.

### Edits and approval review

```text
Operator proposes a reviewable change
  -> server validates account, values and current record
  -> duplicate/no-change checks
  -> pending request with a saved before-state
  -> administrator reviews before/proposed values
       Approve: recheck current state and apply transactionally
       Decline: record decision without applying proposed values
       Stale request: block overwrite and require a fresh submission
```

editWorkflow.js handles reviewable edits and station dates; deletionWorkflow.js handles deletion requests and review. Some station additions, inspections and checklist operations save directly under their existing rules: not every API action uses the approval queue. UI labels such as Approved or Action needed are presentation terms; database/request statuses should be interpreted according to their controller.

### Inspection monitoring

Inspection date, inspector name, and findings/remarks are required on create and edit, with whitespace-only entries rejected in the browser and API. Type and result must be valid choices. Next-inspection date is optional and must not precede the inspection date. New inspections save directly without approval.

Operators can request inspection deletion through the existing occupancy change-request queue (`inspection_delete`). The inspection remains until an admin/superadmin approves. Repeated pending requests are blocked. Review locks the project and inspection, compares the saved inspection snapshot, and blocks deletion if it changed or disappeared. Declining keeps the inspection; approving deletes only that inspection, not the occupancy permit. Administrators retain direct inspection deletion. No additional database table is used.

### Queue management

A device selects the Registration Desk, Window 1, Window 2, Window 3 or
Monitor. `active_workstations` tracks workstation occupancy. Registration issues
tickets using the selected service. Clerk actions call, recall, hold, unhold or
drop tickets. Socket.IO broadcasts `queueUpdate` so connected screens refresh.
A stable request key prevents an uncertain or retried ticket submission from
issuing another ticket. Reset requires explicit confirmation.

## 7. Backend module and API map

| Module | Responsibility |
|---|---|
| monitorServer.js | Permit static routes, API routes, database setup and module wiring |
| authServer.js | Account requests, sign-in and superadmin account administration; imported by monitorServer, not a separate server to run |
| editWorkflow.js | Proposed edits, deduplication, locked snapshots and stale-review checks |
| deletionWorkflow.js | Deletion submission/review and related transaction rules |
| inspectionWorkflow.js | Inspection input validation, deletion requests, duplicate prevention and transactional review |
| stationDates.js | Date validation/normalization and nullable date-column migration |
| projectRecords.js | Remarks endpoints, activity auditing and author checks |
| projectChanges.js | Human-readable before/after change summaries |
| backend/migration/postgres-backup.cjs | Both PostgreSQL backups, manifests and isolated recovery verification |
| queueServer.js | Queue APIs, Socket.IO, workstation sessions and audit logging |
| ticket-submission.js | Queue submission validation and idempotency |

Representative API families (consult source for exact payloads and authorization):

| API family | Use |
|---|---|
| /api/auth/register, /api/auth/login | Permit account request and login |
| /api/auth/accounts/... | Account list, approval, role changes and removal |
| /api/permits and /api/permits/:id | Building registry and project records |
| /api/matrix/add, /api/matrix/remove | Building routing stations |
| /api/permits/:id/signatures | Building routing updates |
| /api/occupancy and /api/occupancy/:id | Occupancy records |
| /api/occupancy/matrix/... | Occupancy stations |
| /api/occupancy/:id/inspections/... | Inspection records |
| /api/occupancy/:id/checklist | Documentary requirements |
| /api/{permits,occupancy}/:id/station-dates | Checked/approved date proposals or authorized changes |
| /api/{permits,occupancy}/change-requests/... | Pending requests, approve/reject review |
| /api/project-records/:kind/:id | Paginated project records |
| /api/project-records/:kind/:id/comments | Remarks submission; internal API name remains comments |
| /api/workstations/login, /api/workstations/logout | Queue workstation occupancy |
| /api/tickets and /api/tickets/{call-next,recall,hold,unhold,drop} | Queue ticket operations |
| /api/system/reset | Queue reset |
| /api/logs | Queue audit retrieval |
| /api/reports | Queue report totals and timing |

## 8. Data storage and relationships

The local setup uses `permit_system_migration` for staff and permit records and
`queue_system_migration` for active and archived tickets, workstation state and
queue activity. The queue service uses the Permit database to check staff
accounts. The legacy `videos` table can remain in the queue database for recovery.

Building permits relate to lots, sub-permits and routing rows. Occupancy permits relate to routing, inspections and one checklist. Change requests identify a project and requester. Several child relationships use ON DELETE CASCADE. project_records intentionally retains its own project/actor snapshots without a foreign key that would erase the audit feed when a project is removed; the current read endpoint still requires a live project.

Date-only fields are kept as YYYY-MM-DD/calendar values rather than converting through UTC. Station dates must be valid, cannot be in the future under the Manila calendar, and an approval date requires a checked date that is not later than it.

| Storage | Contents |
|---|---|
| PostgreSQL | Accounts, permits, stations, requests, Remarks, Logs, inspections, checklist state and queue tickets |
| sessionStorage | Current permit account, queue workstation, per-tab filters/drafts and temporary workflow state |
| localStorage | Theme and personal station template preferences |
| engineeringTheme cookie | Shares theme selection across localhost ports; this is not an authentication cookie |
| frontend/queue frontend/uploads | Legacy uploads that may be present on older installations |
| External backup directory | PostgreSQL archives, manifests, recovered legacy media and verification reports |

The field-level schema appendix records the September 17 MariaDB inspection.
Use the SQL under `backend/migration` for PostgreSQL schema definitions.

## 9. Authentication and current limitations

Permit roles are operator, admin and superadmin. Accounts have verification and
active flags. Passwords are hashed with bcryptjs. Random opaque cookies
authenticate requests through SHA-256 token hashes stored in `permit_sessions`,
with a 30-minute inactivity limit and an eight-hour maximum lifetime. A new
sign-in replaces the account's prior session across Permit and Queue. Requests
check the account's current role and activation. Logs and approvals use the
verified session identity.

Queue workstation selection uses a lease tied to an authenticated Queue
session. Set the service origins and review cookie, proxy, and cross-origin
settings before exposing either service beyond the local host.
[Security configuration](SECURITY-CONFIGURATION.md)

Provision the PostgreSQL schema and the first Superadmin during installation.
The services validate the schema when starting. [IT handoff guide](docs/it-handoff.md)

## 10. React ownership rules

The portal is a normal React state-driven page. Other pages mount synchronously from /system-react/app.js before their existing body scripts run. This keeps existing DOM lookups and DOMContentLoaded initialization in order.

Existing controllers own their dynamic subtrees: registry rows, forms, station matrices, dialogs, remarks and queue panels. Do not trigger a React rerender of those regions while an old controller is modifying them. For a future conversion, migrate a region's rendering and behavior together, then remove the old controller for that region. The legacy root deliberately avoids StrictMode effect replay.

This architecture preserves the existing look and allows gradual improvement, but still has duplicated controllers and custom CSS. React has not automatically modernized authentication, removed duplication or improved every workflow.

## 11. Install, run and rebuild

Run commands from the stated folders. The app, database adapter, migration
tools and frontend build each have their own dependencies.

### Install dependencies when setting up another computer

Follow the [IT handoff guide](docs/it-handoff.md) to install runtime dependencies
and provision both databases. To rebuild the browser files, install the frontend
dependencies from the repository root.

```powershell
npm.cmd --prefix "frontend/portal-react" ci
```

Use the committed lockfile for each directory. PostgreSQL must be running.

### Start the existing system

From the project root, in separate terminals:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File backend/migration/Start-Postgres.ps1 -Service permit
```

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File backend/migration/Start-Postgres.ps1 -Service queue
```

Then open http://localhost:5000/portal.html. Stop a server with Ctrl+C in the terminal running that server. If EADDRINUSE appears, an existing process owns the port; do not launch repeated copies or stop every Node process indiscriminately.

Alternatively run `npm.cmd start` from each corresponding backend folder. The
launcher supplies decrypted credentials only to its child process. Direct Node
startup without PostgreSQL configuration fails closed. Keep both terminals open;
automatic web-server startup is not installed. pgAdmin can be closed.

Read-only port inspection in PowerShell:

```powershell
Get-NetTCPConnection -LocalPort 3000,5000 -State Listen | Select-Object LocalPort,OwningProcess
Get-Process -Id <OwningProcess>
```

### Frontend publication

From frontend/portal-react:

```powershell
npm.cmd run publish:local
npm.cmd run publish:system
```

The first builds/publishes the portal; the second builds/tests/publishes the 13 system layouts. Edit authored CSS/JS under system/assets, then publish; files in the server frontend folders are deployment copies. Refresh the browser after publication; Ctrl+F5 clears stale cached styling.

If the npm shortcut on this PC reports a missing npm-cli.js, use the installed Node npm CLI explicitly:

```powershell
node 'C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js' run build
node publish-local.mjs
node 'C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js' run build:system
node --test system/layout.test.mjs
node system/publish.mjs
```

The preview command npm run dev starts only the portal preview on port 5173. It does not start the databases or the two backends.

## 12. Validation and troubleshooting

From frontend/portal-react, node --test system/layout.test.mjs checks the 14 layout contracts plus native controller invocation. It compares IDs, attributes, visible text, form defaults, selections and original script order.

From the project root:

```powershell
node --test "frontend/monitorBP frontend/*.test.cjs"
```

These checks cover required fields, repeated submits, unsaved edits, registry filters, uncertain requests, remarks and destructive confirmations. Backend test files cover edit/delete review, station dates, record logging, ticket submission and backup recovery. Read their fixture/cleanup requirements before running database-backed tests; they require a database service.

Manual checks should use disposable test records: sign in with each role, open both registries, use filters, inspect Progress/Remarks/Logs, submit and review a test edit, verify stale/duplicate handling, and exercise a test queue ticket through its lifecycle. Do not reset the operational queue or review real permit requests merely to test the UI.

Common diagnoses:

- Page blank after a layout change: check React build output and /system-react/app.js, browser console, then source JSX and script order.
- An HTML edit disappears: it was made in a generated served file rather than system/features.
- UI works but records fail: inspect the backend response/log and database connection; a green portal badge only means an HTTP page responded.
- Layout spacing regresses after wrappers change: check direct-child CSS selectors; React's display:contents root still exists in the DOM.
- Date changes by a day: preserve calendar strings, not UTC serialization for DATE fields.
- Works locally but not on another PC: localhost URLs point at that other PC, not this server.

## 13. Backup and recovery

Follow the [PostgreSQL backup and recovery guide](POSTGRES-BACKUP-RECOVERY.md)
to back up both live databases, verify a restore, or install the scheduled job.

### Historical MySQL backup procedure

The former tool covered **permit_system only**. The historical commands ran
from `backend/monitorBP backend`:

```powershell
node maintenance/permit-backup.js create
node maintenance/permit-backup.js list
node maintenance/permit-backup.js verify <backup-id>
```

Default destination: %LOCALAPPDATA%\PermitManagement\Backups, outside public frontend folders. MYSQL_BIN_DIR can select database tooling; PERMIT_BACKUP_DIR selects backup storage. Database overrides use PERMIT_DB_HOST, PERMIT_DB_PORT, PERMIT_DB_NAME, PERMIT_DB_USER and PERMIT_DB_PASSWORD. See maintenance/BACKUP-RECOVERY.md for complete instructions and requirements.

Creation discovers current tables and produces a SQL dump and integrity manifest. Verification restores into an isolated temporary database using a restricted temporary account, checks schema/data/relationships, and cleans up. It is not a live restore command. A passed database verification is not a complete browser/application recovery drill.

The September 10 verification covered the 12 tables present at that time. The schema has since added project_records, permit_sessions and the three People/Profile tables described below; create and verify a fresh backup after the latest server initialization. No new backup was created by this cleanup.

The original MySQL procedure omitted `queue_system`, legacy queue uploads,
project source, Windows configuration and database server accounts.

## 14. Cleanup performed September 16, 2026

Removed obsolete hashed portal JS/CSS bundles, the empty root system-dist directory, the empty orphaned root package-lock.json, the unused figma-building-preview.html, and the unreferenced queue-clock.js. C/C++ editor settings are preserved as requested. The portal publisher now prunes obsolete hashed JS/CSS after copying the new assets and entry point.

Preserved current published bundles, source images, active pages, workflow modules, dependency folders/lockfiles, generated staging builds, migration originals used by tests, uploaded files and diagnostic logs. Logs are small and may be attached to a running process. No backend business logic, database tables, records, accounts, queue tickets or external backups were removed.

The originals and generated files still present have documented roles. Do not delete them simply because filenames resemble the live pages. Future cleanup should follow references and build ownership rather than remove duplicates by name.

## 15. Historical field-level schema reference

Legend: PK = primary key; UNI = unique-index participation; MUL = non-unique-index participation. A column's key marker alone does not describe the complete definition of a composite index. Nullable means SQL NULL is allowed. Defaults, index order, triggers and complete DDL are not reproduced here; this appendix is a field/relationship reference, not a restoration script.



### permit_system

#### occupancy_change_requests

| Column | Type | Nullable | Key |
|---|---|---|---|
| `id` | `int(11)` | NO | PRI |
| `occupancy_id` | `int(11)` | NO | MUL |
| `requested_by` | `int(11)` | YES | MUL |
| `change_type` | `varchar(50)` | NO | — |
| `changes` | `longtext` | YES | — |
| `status` | `varchar(20)` | NO | — |
| `remarks` | `text` | YES | — |
| `reviewed_by` | `varchar(50)` | YES | — |
| `reviewed_at` | `timestamp` | YES | — |
| `created_at` | `timestamp` | NO | — |

Declared foreign keys: `occupancy_id` → `occupancy_permits.id`; `requested_by` → `users.id`.

#### occupancy_checklists

| Column | Type | Nullable | Key |
|---|---|---|---|
| `id` | `int(11)` | NO | PRI |
| `occupancy_id` | `int(11)` | NO | UNI |
| `checklist_state` | `longtext` | YES | — |
| `updated_at` | `timestamp` | NO | — |

Declared foreign keys: `occupancy_id` → `occupancy_permits.id`.

#### occupancy_inspections

| Column | Type | Nullable | Key |
|---|---|---|---|
| `id` | `int(11)` | NO | PRI |
| `occupancy_id` | `int(11)` | NO | MUL |
| `inspection_type` | `varchar(50)` | NO | — |
| `inspection_date` | `date` | NO | — |
| `inspector_name` | `varchar(150)` | YES | — |
| `result` | `varchar(50)` | YES | — |
| `findings` | `text` | YES | — |
| `next_inspection_date` | `date` | YES | — |
| `created_at` | `timestamp` | NO | — |

Declared foreign keys: `occupancy_id` → `occupancy_permits.id`.

#### occupancy_permits

| Column | Type | Nullable | Key |
|---|---|---|---|
| `id` | `int(11)` | NO | PRI |
| `bp_reference_no` | `varchar(100)` | NO | — |
| `project_title` | `varchar(255)` | NO | — |
| `location` | `varchar(255)` | NO | — |
| `owner_name` | `varchar(255)` | NO | — |
| `date_applied` | `date` | NO | — |
| `rejection_history` | `text` | YES | — |

#### occupancy_routing_matrix

| Column | Type | Nullable | Key |
|---|---|---|---|
| `id` | `int(11)` | NO | PRI |
| `occupancy_id` | `int(11)` | YES | MUL |
| `discipline_name` | `varchar(100)` | NO | — |
| `engineer_name` | `varchar(100)` | YES | — |
| `signature_status` | `varchar(50)` | YES | — |
| `feedback_remarks` | `text` | YES | — |
| `date_checked` | `date` | YES | — |
| `date_approved` | `date` | YES | — |

Declared foreign keys: `occupancy_id` → `occupancy_permits.id`.

#### permits

| Column | Type | Nullable | Key |
|---|---|---|---|
| `id` | `int(11)` | NO | PRI |
| `project_title` | `varchar(255)` | NO | — |
| `location` | `varchar(255)` | NO | — |
| `owner_name` | `varchar(255)` | NO | — |
| `designer_name` | `varchar(255)` | NO | — |
| `permit_date` | `date` | NO | — |
| `created_at` | `timestamp` | NO | — |
| `rejection_history` | `text` | YES | — |

#### permit_change_requests

| Column | Type | Nullable | Key |
|---|---|---|---|
| `id` | `int(11)` | NO | PRI |
| `permit_id` | `int(11)` | NO | MUL |
| `requested_by` | `int(11)` | YES | MUL |
| `change_type` | `varchar(50)` | NO | — |
| `changes` | `longtext` | YES | — |
| `status` | `varchar(20)` | NO | — |
| `remarks` | `text` | YES | — |
| `reviewed_by` | `varchar(50)` | YES | — |
| `reviewed_at` | `timestamp` | YES | — |
| `created_at` | `timestamp` | NO | — |

Declared foreign keys: `permit_id` → `permits.id`; `requested_by` → `users.id`.

#### permit_lots

| Column | Type | Nullable | Key |
|---|---|---|---|
| `id` | `int(11)` | NO | PRI |
| `permit_id` | `int(11)` | NO | MUL |
| `lot_number` | `varchar(100)` | NO | — |

Declared foreign keys: `permit_id` → `permits.id`.

#### permit_routing_matrix

| Column | Type | Nullable | Key |
|---|---|---|---|
| `id` | `int(11)` | NO | PRI |
| `permit_id` | `int(11)` | YES | MUL |
| `sub_permit_id` | `int(11)` | YES | MUL |
| `discipline_name` | `varchar(100)` | NO | — |
| `engineer_name` | `varchar(150)` | YES | — |
| `signature_status` | `varchar(50)` | YES | — |
| `feedback_remarks` | `text` | YES | — |
| `date_checked` | `date` | YES | — |
| `date_approved` | `date` | YES | — |

Declared foreign keys: `permit_id` → `permits.id`; `sub_permit_id` → `sub_permits.id`.

#### project_records

| Column | Type | Nullable | Key |
|---|---|---|---|
| `id` | `bigint(20) unsigned` | NO | PRI |
| `kind` | `varchar(16)` | NO | MUL |
| `project_id` | `int(11)` | YES | — |
| `project_title` | `varchar(255)` | NO | — |
| `actor_id` | `int(11)` | NO | — |
| `actor_name` | `varchar(100)` | NO | — |
| `actor_role` | `varchar(20)` | NO | — |
| `category` | `varchar(16)` | NO | — |
| `outcome` | `varchar(20)` | NO | — |
| `message` | `text` | NO | — |
| `details` | `mediumtext` | YES | — |
| `request_key` | `varchar(100)` | YES | UNI |
| `created_at` | `timestamp` | NO | — |

#### sub_permits

| Column | Type | Nullable | Key |
|---|---|---|---|
| `id` | `int(11)` | NO | PRI |
| `permit_id` | `int(11)` | NO | MUL |
| `sub_project_title` | `varchar(255)` | NO | — |

Declared foreign keys: `permit_id` → `permits.id`.

#### system_disciplines

| Column | Type | Nullable | Key |
|---|---|---|---|
| `id` | `int(11)` | NO | PRI |
| `discipline_name` | `varchar(100)` | NO | UNI |

#### users

| Column | Type | Nullable | Key |
|---|---|---|---|
| `id` | `int(11)` | NO | PRI |
| `username` | `varchar(100)` | NO | UNI |
| `password` | `varchar(255)` | NO | — |
| `role` | `varchar(20)` | NO | — |
| `is_verified` | `tinyint(1)` | YES | — |
| `created_at` | `timestamp` | NO | — |
| `is_active` | `tinyint(1)` | NO | — |


### queue_system

#### active_workstations

| Column | Type | Nullable | Key |
|---|---|---|---|
| `workspace` | `varchar(50)` | NO | PRI |
| `logged_in_at` | `timestamp` | NO | — |

#### audit_logs

| Column | Type | Nullable | Key |
|---|---|---|---|
| `id` | `int(11)` | NO | PRI |
| `timestamp` | `datetime` | YES | — |
| `action` | `varchar(255)` | NO | — |
| `user_station` | `varchar(50)` | YES | — |
| `details` | `text` | YES | — |

#### tickets

| Column | Type | Nullable | Key |
|---|---|---|---|
| `id` | `int(11)` | NO | PRI |
| `name` | `varchar(255)` | NO | — |
| `phone` | `varchar(50)` | YES | — |
| `email` | `varchar(255)` | YES | — |
| `barangay` | `varchar(255)` | NO | — |
| `reason` | `text` | NO | — |
| `status` | `enum('waiting','holding','serving','dropped')` | YES | — |
| `called_by` | `varchar(50)` | YES | — |
| `recall_stamp` | `bigint(20)` | YES | — |
| `created_at` | `timestamp` | NO | — |

#### ticket_submission_keys

| Column | Type | Nullable | Key |
|---|---|---|---|
| `request_id` | `char(36)` | NO | PRI |
| `fingerprint` | `char(64)` | NO | — |
| `ticket_id` | `bigint(20)` | YES | — |
| `created_at` | `timestamp` | NO | — |

#### videos

| Column | Type | Nullable | Key |
|---|---|---|---|
| `id` | `int(11)` | NO | PRI |
| `filename` | `varchar(255)` | NO | — |
| `filepath` | `varchar(255)` | NO | — |
| `uploaded_at` | `timestamp` | NO | — |
| `is_active` | `tinyint(1)` | YES | — |

Additional existing tables, not referenced by the current queue backend: `occupancy_change_requests`, `occupancy_checklists`, `occupancy_inspections`, `occupancy_permits`, `occupancy_routing_matrix`, `permits`, `permit_change_requests`, `permit_lots`, `permit_routing_matrix`, `sub_permits`, `system_disciplines`, `users`. These are preserved and not treated as disposable data.

### Queue service transitions during the September rollout

`backend/queue backend/queue-service.js` owns call-next, recall, hold, and complete transitions. Each window has its own current ticket (`status = serving`, `called_by = PC1/PC2/PC3`). Calling from either waiting or holding is rejected while that window is occupied. The server selects eligible reasons from its own window mapping. Recall, hold, and completion require the current ticket ID; stale requests cannot act on the next visitor.

A connection-owned MySQL named lock serializes service transitions across server processes, and a transaction locks the selected records. Completed tickets remain stored with status `completed`; they are excluded from waiting, held, and serving lists. Startup appends `completed` to the known status enum before opening port 5000. This is an additive schema change; it does not reset tickets or recover tickets previously marked dropped. Restart the queue backend after installing this change.

Socket updates include all `serving` tickets and retain `nowServing` for the latest call. The monitor shows all three windows and announces new calls and recalls automatically when the browser allows autoplay. A click or key press retries blocked audio. Clerk controls show the current ticket and a visible action result. Edit the kiosk and monitor sources under `frontend/portal-react/system/features/queue`, then build and publish.

Validation: run `node --test queue-service.test.cjs ticket-submission.test.cjs` from `backend/queue backend`. Tests use connection-local temporary tables so application ticket records remain untouched; they cover the A/B hold sequence, window isolation, stale requests, completion, recall, schema upgrade, and lock contention.


### Permit sessions during the September rollout

The session rollout adds `permit_sessions` (token_hash, user_id, expires_at, created_at). Startup completes schema initialization before opening port 3000. Existing accounts/passwords are preserved: startup no longer seeds default administrator passwords or resets existing credentials. A fresh database must have accounts provisioned separately; restarting is not a password recovery mechanism.

`POST /api/auth/login` rotates the current browser session after password verification. `GET /api/auth/session` returns the verified current user. `POST /api/auth/logout` deletes only the current session and clears its cookie. Separate browser profiles/devices have independent sessions; tabs in the same profile share the cookie. Session expiry does not silently retry writes; the frontend offers a sign-in link while retaining current form contents.

All permit APIs except login, registration, and health require authentication. Review endpoints require admin/superadmin; account administration requires superadmin. Existing operator request/approval rules remain in their workflow modules. Protected page URLs, including encoded and case variants, redirect unauthenticated users to login and other roles to their own landing page.

Cookies use HttpOnly, SameSite=Strict, path=/, and an eight-hour lifetime. Set PERMIT_COOKIE_SECURE=true for HTTPS deployment, and set PERMIT_PUBLIC_ORIGIN to the exact public origin when using a proxy. Mutations require the x-permit-request custom header and reject foreign origins; the shared permit frontend sets it automatically. Serve permit pages from the permit server, not Live Server. `/api/health` exposes no account or record data and supports the portal status check.

Run `node --test permitSessions.test.cjs` from `backend/monitorBP backend` for HTTP tests with temporary database tables: four simultaneous users, cookie flags, forged identity, roles, direct page access, session rotation, logout isolation, expiry, role changes, and disabled accounts. Existing editWorkflow/inspectionWorkflow/deletionWorkflow/projectRecords tests also cover request conflicts and attribution. This rollout preserves existing snapshot conflict checks; it does not add blanket version protection to every direct record update. Queue workstation sessions are separate and unchanged.

### Database separation — 23 September 2026

`permit_system` is the active permit database. `queue_system` now contains only `active_workstations`, `audit_logs`, `ticket_submission_keys`, `tickets`, and `videos`.

Twelve older permit-related tables formerly stored in `queue_system` were moved together to `archive_queue_permits_20260923`. This archive is historical data, not an application database. It preserves all 52 old rows and their internal foreign keys; the old records were not merged into the active permit database. Both active databases were verified unchanged apart from removing those unused tables from the queue schema.

Before the move, a full queue backup was restored successfully in an isolated verification database: `permit-backup-20260923T065746976Z-c3c42752cb20`, stored under the configured private `PermitManagement/Backups` folder. The backup tool's historical filename prefix says permit-backup, but its manifest identifies the backed-up database as `queue_system`.

The maintenance report `backend/monitorBP backend/maintenance/queue-archive-20260923.json` records row counts, content checksums, verification results, and reverse RENAME SQL. The reverse SQL is a recovery reference only; review current table names before running it. The applications do not reference the archive.


## Printable project summaries (September 2026)

Building and occupancy Details workspaces have a Print Summary link. It opens a shared preview with a provisional template; Print / Save as PDF uses the browser print dialog. Use A4 paper. Browser print settings control optional browser headers, footers and page numbers.

The summary contains the stable BP/OP ID, saved project information, main/sub-permit routing status and review dates. Occupancy summaries also include saved inspections and documentary checklist states. Remarks and Logs are excluded from printed summaries, including the routing Remarks column. The preview does not fetch project-record feeds. The footer identifies the authenticated user and generation time in Asia/Manila. The document is labelled Project Summary — Not an Official Permit.

No new tables, migrations, PDF storage, or write endpoints are required. The preview reads through existing session-protected APIs with cache disabled; it does not use unsaved fields or apply pending requests. Loading failures hide incomplete output and disable printing. The preview shell contains no private project data; its data requests require authentication. The print button rechecks the session. Multiple API reads are not a transactional database snapshot; Refresh saved data retrieves current values before printing.

Template presentation is isolated in project-summary.css and the render function in project-summary.js, allowing a later agreed template without changing permit workflows. Automated fixture checks and the production frontend build passed; physical printing and browser PDF pagination still require user verification.


## Permit workspace navigation

Building and occupancy registries and Details pages share a left sidebar with Building Permits, Occupancy Permits, and Log out. The header and sidebar stay fixed during page scrolling. Body padding reserves the header height so content begins below it; only header size changes update this shared offset. The active permit type is highlighted. Desktop navigation collapses to icons, with its preference stored locally as permitNavCollapsed. Below 1001px, navigation becomes a drawer with Escape dismissal and keyboard focus containment. It uses the existing light/dark theme and logout/session implementation. The full-width header retains creation/status/theme controls; duplicate workspace/logout header controls are hidden on these four pages. No database or backend changes are involved.


## People and My Profile (September 25, 2026)

People and My Profile are React-owned dialogs accessible from both operator workspaces (including Details) and from the admin/superadmin header. They are mounted as siblings of the existing Page component: opening, searching or editing them does not rerender legacy form/table DOM. The dialogs support keyboard dismissal, unsaved-profile prompts, internal scrolling, mobile layouts, and the existing light/dark theme.

### What is stored

The next permit-server startup creates three additive InnoDB tables in permit_system, before opening port 3000. There are 17 permit tables once this initialization completes. Existing project records and login usernames are unchanged.

| Table | Columns and purpose |
|---|---|
| permit_user_profiles | user_id INT primary key; display_name VARCHAR(80); bio VARCHAR(300); avatar_color VARCHAR(16). Optional presentation data. Defaults fall back to the login username and blue initials avatar. |
| permit_presence | session_hash CHAR(64) primary key; last_seen DATETIME(3); nullable last_active DATETIME(3); last_seen index. Activity timestamps linked by hash to a valid permit_sessions row. No raw cookie/token is stored here. |
| permit_people_settings | setting_key VARCHAR(50) primary key; user_id INT. Captures the built-in hidden account ID once under hidden_account. |

Startup captures the account whose username and role are both superadmin using INSERT IGNORE. Once captured, hiding follows that stored ID even after a rename. Passwords are never used to identify the hidden account. Only People excludes it; authorized superadmin account-management screens retain their existing behavior. Other approved superadmin accounts appear normally. Profile ownership and presence are joined to active, verified users and valid sessions; orphaned profile/presence rows cannot grant access. Presence rows older than one day are pruned on startup. The backup utility discovers all tables automatically, including these tables; no separate avatar files are uploaded.

### APIs and authorization

All of these endpoints require the existing permit_session cookie. Writes retain the shared same-origin/custom-header protection. The client includes x-user-id only as a stale-tab hint, never as authorization.

| Endpoint | Behavior |
|---|---|
| GET /api/people?q=&page=1 | Approved, active accounts only; hidden ID excluded; case-insensitive display-name/username search; 30 results per page and hasMore. Returns ID, username, role, display name, bio, avatar color and online/away/offline status only. |
| GET /api/profile | Reads the signed-in user's profile. |
| PUT /api/profile | Updates only the signed-in user's display_name, bio and avatar_color. Rejects unexpected fields, blank names, overlong text and unknown colors. |
| POST /api/presence | Updates the current session's heartbeat; active must be boolean. |
| POST /api/profile/password | Requires current_password and new_password. Verifies the current bcrypt hash, hashes the replacement, updates conditionally in a dedicated transaction and deletes every session for that user. Clears the browser cookie after commit. |

Display names are separate from login usernames and do not rewrite historical Remarks/Logs or approval actors. Profile editing cannot change roles, verification, active state or another user's ID. Passwords require at least 6 characters and at most 72 UTF-8 bytes; repeated password-change attempts are limited to five per account per 15 minutes in process memory. This limiter resets on server restart. A successful password change signs the user out on every device; other users remain signed in. Session issuance uses a conditional INSERT…SELECT against the verified password hash, role and active/verified flags, so a stale login comparison cannot issue a session after credentials have changed.

### How presence works

While an authenticated workspace/dashboard is open, it sends a heartbeat about every 30 seconds. Recent pointer, keyboard, scroll or focus activity in a visible, focused tab updates activity. Background tabs never clear activity reported by another tab sharing the session. Online requires a heartbeat within 90 seconds and activity within five minutes; a recent heartbeat without recent activity shows Away; otherwise the user is Offline. Only unexpired sessions count, so logout, password changes, account deactivation and session expiry invalidate presence. Closing a tab or losing a connection may take about 90 seconds to appear offline; browser background throttling can also affect this estimate. Presence is approximate, not an attendance record. Queue screens do not send permit presence heartbeats.

The People dialog refreshes about every 30 seconds while visible. Fetch failures show an error with Retry and do not keep presenting old status as current. There is no chat, friend-request system, photo upload or automatic account-role editing in this feature.

### Editing, rollout and validation

- UI/state: frontend/portal-react/system/features/accounts/AccountTools.jsx.
- Styling: frontend/portal-react/system/assets/permits/account-tools.css.
- Sidebar entry points: system/shared/PermitSidebar.jsx. Admin header slot: system/features/administration/dashboard.jsx.
- Server/schema: backend/monitorBP backend/peopleProfiles.js, wired in monitorServer.js; permitSessions.js owns session hashing and cookie clearing.
- Publish frontend edits from frontend/portal-react with npm.cmd run publish:system, then refresh. Restart monitorServer.js once to register the APIs and initialize the three tables; queueServer does not need restarting for this feature.
- Backend check: from backend/monitorBP backend, run node --test peopleProfiles.test.cjs permitSessions.test.cjs permitPages.test.cjs. The integration tests use connection-local temporary tables and fixture credentials, never real account updates.
- Frontend check: publish:system includes account-tools.test.cjs, exercising search, escaped text, draft preservation, editable-field payloads, password confirmation and expired-session feedback against a fake API.

For a manual check after restart: sign in with two approved accounts in separate browser profiles, open People, edit one display name in My Profile and confirm it appears in the other profile's directory. Confirm the built-in account is absent. Log out one account and refresh People from the other. Test password changes only on a disposable test account; confirm old sessions can no longer make API requests.


## Concurrent edit protection (September 25, 2026)

Workspace reads now return an opaque _version token alongside editable data. Save requests send the token that was loaded with the form in the x-record-version header. The server locks the parent record, compares that token with current data, and commits the write in a dedicated transaction only when it matches. Missing or outdated tokens return HTTP 409 with conflict:true. This extends the existing approval snapshot mechanism; it requires no new database tables or columns.

The token is a SHA-256 fingerprint of the relevant saved state, not an incrementing display number. A Building detail/routing token covers the permit, lots, main/sub-permit routing and approved-request revision. Occupancy routing uses its permit/routing snapshot. Each inspection has its own token, and each Occupancy checklist has a separate token (including the initial empty checklist). Independent checklist or inspection work therefore does not unnecessarily invalidate a routing edit.

Covered operations:

- Building detail and lot saves: operators submit requests; direct authorized saves are now atomic, including rollback if a lot update fails.
- Building and Occupancy routing submissions/direct saves and station additions/removals, including Building sub-permits. Existing role rules remain enforced.
- Inspection edits and deletion submissions/direct authorized deletions. New inspections still save directly; operator deletions still require review.
- Checklist saves, including two users attempting the first checklist insert simultaneously.
- Edit approvals retain their second snapshot comparison and pending-status lock, so an older pending request cannot overwrite a later approved change and two reviewers cannot apply the same request twice. Inspection-deletion approvals still compare the inspection snapshot before removal.
- Station dates retain their existing expected_dates check and approval-snapshot protection.

Occupancy project information currently has no general detail-update endpoint; it remains read-only in that workspace. Whole-project deletion retains its existing conditional approval workflow. This change does not add new edit/delete permissions, merge drafts automatically, or lock an entire workspace while someone is typing.

A conflict does not reload the form, clear its inputs, or silently fetch a newer token and retry. Routing edit mode stays open; inspection dialogs retain their values; checklist selections remain dirty. Buttons become usable again. Users can copy their inputs and explicitly refresh to review the current record. Refreshing itself can discard a draft after the existing unsaved-change confirmation.

### Validation performed

People/Profile checks use fixture accounts and temporary tables: approved-account visibility, the hidden built-in ID after renaming, search, self-only profile updates, online/away/offline, expired/logged-out sessions, five-character rejection/six-character acceptance, current-password verification, and revocation of all the changed account's sessions. No real user credentials or project records are changed by these tests.

Concurrent edit tests use separate real MySQL connections to a random permit_concurrency_test_ database containing synthetic data, then remove only that exact database. They exercise simultaneous detail saves, competing reviewers, stale routing submissions, station mutations, inspection edits/deletion conflicts and first/subsequent checklist saves. The frontend tests execute the shipped React layout and actual workspace controllers against conflict responses to verify draft preservation and the correct version header.

From backend/monitorBP backend run:

~~~powershell
node --test peopleProfiles.test.cjs permitSessions.test.cjs editWorkflow.integration.test.js inspectionWorkflow.test.cjs concurrentEdits.test.cjs
~~~

From frontend/portal-react run npm.cmd run publish:system to build, run the frontend checks and publish the page controllers. Restart monitorServer.js to activate the backend changes, then hard-refresh open permit pages. An old page without a version is deliberately rejected rather than allowed to overwrite data.

### Manual acceptance checks after restart

1. Use two approved accounts in separate browser profiles. Check People visibility/status and saved profile edits. Use a disposable test account for password changes and verify its old sessions are rejected; other accounts stay signed in.
2. Open the same test Occupancy inspection in both profiles. Save A's changes, then attempt B's older draft. B should see a conflict, retain its inputs and leave A's saved values intact. Repeat with the checklist.
3. Open the same routing matrix in both profiles. Submit A's change and approve it through an administrator. Submit B's older draft: it must be blocked before creating a new pending request. Repeat for Building and Occupancy.
4. To test two existing pending requests, submit both before any approval, approve one, then attempt the other. The second must be marked as a conflict and leave the first approved change intact.

## Permit CSV export and import (2026-09-26)

- Operators: **Export CSV** appears under Permit records in both registries. It sends the entire filtered ID list (all pages, current sort order) to the authenticated backend. Maximum 10,000 records per export. Fields are explicitly selected; account data, Remarks, Logs, routing details and inspection records are excluded. Building exports also include designer and pipe-separated lots; occupancy exports include BP reference. IDs and status are report-only columns. UTF-8 BOM, CSV quoting and formula neutralization support opening the result in Excel.
- Administrators and superadministrators: **Import permits** appears in the dashboard heading. Select Building or Occupancy, download that template, fill it, save as CSV UTF-8, upload, preview, then confirm. Templates and export reports have different purposes: export reports cannot be directly re-imported.
- Import limits: 100 rows and 80 KB. Exact template headers (any order), required fields, SQL column lengths, plain text, real YYYY-MM-DD dates and 1–30 distinct building lot numbers (separated with `|`) are checked on the server. Existing project IDs and statuses cannot be supplied. Auto-increment IDs retain separate BP/OP numbering; aborted transactions may leave normal numbering gaps.
- Preview makes no writes. Possible existing duplicates are flagged by normalized project name OR matching owner and location. Staff must explicitly acknowledge these as distinct records before proceeding. Repeated project names within the file are blocked. This is conservative duplicate detection, not a universal identity/uniqueness rule.
- Confirm revalidates the file and the preview fingerprint. All inserted permits and lots, plus the batch receipt, commit on a dedicated connection in one transaction. A database-scoped named lock serializes import batches. A concurrent manual create can still occur; duplicate detection is advisory rather than a unique database constraint.
- A new additive table, `permit_import_batches`, stores the request UUID, actor ID, permit kind, payload hash, created project IDs and timestamp. It does not store the raw CSV. It prevents repeat submissions with the same UUID and supplies batch attribution. It is separate from the per-project Logs feed. Existing permit tables are not altered.
- If a response is lost, **Retry same import** preserves the same request ID and payload while the page remains open. Reopening the dialog retains that batch; refreshing the page loses the local retry state. Before starting another preview after an uncertain response, check the registry and duplicate warnings.
- Main implementation: `backend/monitorBP backend/permitTransfer.js`; registration and startup migration: `monitorServer.js`. Independent React island: `frontend/portal-react/system/features/transfer/PermitTransfer.jsx` and its CSS. Registry HTML controllers expose `window.permitExportIds`; they retain ownership of filtering and pagination.
- Publish frontend changes from `frontend/portal-react` with `npm.cmd run publish:system`. Backend changes require restarting the permit server. No queue server restart is required.
- Verification: `node --test permitTransfer.test.cjs` from the permit backend creates/drops only a uniquely named `permit_transfer_test_<random>` database. Tests cover validation, CSV escaping, permissions, read-only preview, simultaneous retries, filtered export, duplicate acknowledgement, independent IDs, and transaction rollback. Frontend transfer tests verify full filtered exports and retry identity without touching real data.
- Trial/revert: see `.feature-backups/permit-transfer-20260926/REVERT.md`. Reverting code does not delete records deliberately imported during the trial.

### Native Excel export (2026-09-26)

Both registries offer **Export Excel (.xlsx)** alongside **Export CSV**. The same authenticated export endpoint accepts `format: "xlsx"` and uses the same filtered IDs, ordering and field allowlist. Excel exports have a Building Permits or Occupancy Permits sheet, readable column headings and widths, alternating row shading, a frozen header and filters. Valid calendar dates become Excel date cells; IDs and other text stay strings (including text beginning with `=`), never executable formulas.

`backend/monitorBP backend/permitWorkbook.js` writes workbooks using the backend's ExcelJS dependency, recorded in package.json/package-lock.json. New installations must run `npm.cmd ci` in the backend before starting. Export writes no database records and needs no schema change. Imports still accept CSV UTF-8 only; Excel report files are not import templates. Tests reload the produced XLSX buffers to check cell types, calendar dates, headings, freeze panes and filters, and exercise both permit export endpoints.

## Administrator dashboard overview (2026-09-27)

Admin and superadmin pages now include a read-only At a glance dashboard above the existing review panels: total building/occupancy records, pending review requests, deletion requests (a subset of pending reviews), and six latest change-request submissions. These are permit-system counts, not queue-system metrics. The latest-requests list excludes requests whose parent permit has been deleted and is not a full audit feed.

Superadmins additionally receive account totals and pending account-request counts, with shortcuts to their existing account panels. Admin responses omit account counts. The authenticated GET `/api/admin/overview` is restricted server-side to admin/superadmin; failures return an unavailable state rather than misleading zero totals. No schema changes or writes are involved.

Backend: `backend/monitorBP backend/adminOverview.js`, mounted in `monitorServer.js`. UI: `frontend/portal-react/system/features/administration/AdminOverview.jsx` and `admin-overview.css`, embedded in the existing dashboard layout. Existing approval controllers emit `admin-data-changed` when lists reload; the overview debounces its refresh. A manual Refresh overview button fetches current metrics. It does not poll continuously or refresh pending-review cards on its own. Shortcuts scroll to the existing review/account panels and respect reduced motion. Dark/mobile layouts are included.

Tests cover role gates, superadmin-only account counts, backend failure responses, safe rendering, shortcut targets, count display, and recovery after failed requests. Publish with `npm.cmd run publish:system` from `frontend/portal-react`; restart the permit backend to activate the new API.

## Verified office database/media recovery (September 29, 2026)

`backend/monitorBP backend/maintenance/office-recovery-drill.js` now runs local database backup and isolated restore checks for both permit_system and queue_system, plus copy/restore checksums for referenced queue videos. It reuses the existing restricted verification accounts, never restores into live databases, and removes temporary recovery resources. Backups are stored outside the project/web roots in `%LOCALAPPDATA%\PermitManagement\Backups`, under separate database subfolders.

The first combined drill passed: permit database 18 tables / 112 rows / 11 declared FK relationships; queue database 5 tables / 934 rows / no declared FKs; three queue videos restored with matching checksums. Temporary cleanup passed. A supplementary read-only check found no orphaned non-null queue submission ticket references. Source records were not edited by the drill. Database snapshots are independent; this verifies data/schema and media recovery, not a full application failover or machine backup. No automatic schedule, off-device copy or encryption was enabled.

See `backend/monitorBP backend/maintenance/BACKUP-RECOVERY.md` for exact backup/report paths, rerun commands, verification scope and replacement-computer recovery steps. The shared backup manifest now states database-only scope rather than incorrectly labelling every configured source as the permit database.


### Permit authentication attempt limits

Permit login accepts 10 attempts per normalized username and peer IP in a fixed 15-minute window, plus 100 total login attempts per peer IP in that window. A successful login clears the username/IP counter only. Registration accepts 10 requests per peer IP per hour, including invalid and successful requests. Excess requests receive HTTP 429 with Retry-After and retryAfter seconds before database or bcrypt work. The frontend displays the cooldown. Operators sharing an office IP have separate username counters but share the broad IP cap.

New registration and Change Password share passwordPolicy.js: minimum 6 characters, maximum 72 UTF-8 bytes (bcrypt limit); passwords are not trimmed. Existing shorter passwords remain usable for login. Registration still requires account approval. No accounts, passwords, or database tables are migrated by this change.

authLimits.js keeps at most 5,000 hashed counter keys in memory, removes expired entries, and rejects new keys temporarily if full. Restarting the permit server resets counters. Limits use the socket peer address and ignore client forwarding headers. Before deploying behind a reverse proxy or across several server instances, configure trusted client-address resolution and a shared rate-limit store; otherwise proxied clients share a counter and instances have independent counters. These controls are local attempt throttling, not full DDoS protection.

Validation: node --test authLimits.test.cjs from backend/monitorBP backend uses fake clocks and an isolated HTTP server with a mock database, covering cooldown expiry, address isolation, forwarding-header spoofing, successful login resets, memory capacity, password boundaries, and route enforcement.


### Queue staff authorization during the initial rollout
Windows 1–3 require an approved, active Operator, Admin, or Superadmin account from the Permit database. Sign in on the Queue login page. Permit and Queue have separate HttpOnly cookies and share the Permit session table. A new sign-in replaces the account's previous session across both apps. Password changes revoke the account's sessions, and API requests check the account's active status and role. Queue login reuses the Permit login throttling and password verification.

The queue server connects to the account database using PERMIT_DB_HOST, PERMIT_DB_USER, PERMIT_DB_PASSWORD, and PERMIT_DB_NAME (local defaults match the current installation). The account database must be reachable, though the permit HTTP server need not be running. PERMIT_COOKIE_SECURE=true enables secure cookies behind HTTPS; QUEUE_PUBLIC_ORIGIN defines the trusted queue origin behind a proxy. Protected writes require the same origin and the x-queue-request header.

Each service window has one server-owned lease tied to the queue session. Requests cannot choose another session's window by changing the workspace body field. Call, recall, hold, complete, return-from-hold, and drop require ownership. Drop and return-from-hold are limited to the assigned window's service categories. Only admin/superadmin sessions can reset the queue; exact RESET confirmation remains required. Operators do not see the reset button. No client-supplied role authorizes an action.

Window leases are held in memory for the current single queue-server process (at most three entries). Restarting queueServer clears those leases; choose the workstation again. Refreshing a page retains ownership, while explicit staff logout releases the window and revokes that queue session. An expired/revoked owner's lease can be reclaimed on selection. Concurrent tabs in the same browser share the queue cookie, so use separate browser profiles or devices for different accounts. Before scaling to multiple queue-server processes, move leases into a shared transactional store.

The public registration kiosk and monitor open without staff credentials. Ticket submission remains public with the existing validation/idempotency checks and a same-origin request header. Public queue payload privacy, media-upload controls, and log-access restrictions remain separate security work; this change does not claim to secure those endpoints.

After publishing: restart queueServer.js, refresh with Ctrl+F5, and select/sign into the staff window. Test with separate browser profiles: the second profile cannot claim an occupied window; an operator cannot reset; admins can access reset (do not execute it on a live queue). Existing tickets are preserved during deployment. Automated authorization tests use a mock account store and isolated HTTP server; queue transition and permit-session regressions use connection-local temporary tables.
