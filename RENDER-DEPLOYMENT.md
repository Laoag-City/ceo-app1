# Fresh deployment test: Laoag Engineering's Office

Use a private `majingamo/laoag-engineerings-office` repository, two free Render
Node web services, two separate Neon databases, and Cloudinary for videos.
This is a team test; the IT department will handle the official deployment.
Local records remain separate from these new cloud copies.

## Current test deployment — 13 October 2026

Both Render services are live on application commit `ed6c365543db37738bcdf217efc2cbe8da09d047`.
The private GitHub repository contains the current code and published frontend.
This release adds the Building requirements checklist, six saved procedure steps,
and matching checklist / summary cards in both permit workspaces. Building shows
16 items; Occupancy retains its existing 15 documents. Items 8a and 8b show
**If applicable**, and item 4 uses **Indicating specific purpose: Construction /
Fence / Demolition**. Saved procedure completion also appears in print summaries.

The additive `permit_checklists` migration was applied before deployment.
Neon has **23 Permit tables** and **6 Queue tables**. The new table has a unique
`permit_id`, a cascading foreign key to `permits.id`, JSON state and verified
runtime permissions. All 358 rows in the 22 pre-existing Permit tables were
unchanged by the migration. Queue video records match the new backup, and the
enabled video still delivers successfully. No database restore or reset occurred.

Fresh consistent backups captured 358 Permit rows and 1,005 Queue rows. Private
backup directory: `C:\Users\Majin\PermitManagementPostgresBackups\pilot-pre-requirements-20261013014425357-42d19a84`.

Verification passed: 252 frontend checks, 4 SQL adapter checks, 22 PostgreSQL
inspection/checklist checks and 13 bulk-deletion checks. Hosted health, login,
security headers, portal links and served file hashes passed. Checklist APIs
require sign-in. The Permit deploy is `dep-db6osgl9fdbs73dona8g`; Queue is
`dep-db6ot2vf3r2c73bug2h0`. Normal signed-in acceptance tests remain available
in [Building requirements UAT](BUILDING-REQUIREMENTS-UAT.md).

For a code rollback, `d0abe86` remains available. Retain the additive checklist
table and any subsequently saved checklist records when reverting the code.

## Previous pilot update — 12 October 2026

| Resource | Address or name |
| --- | --- |
| Private source repository | [majingamo/laoag-engineerings-office](https://github.com/majingamo/laoag-engineerings-office) |
| Systems portal | [Open portal](https://laoag-engineering-permits.onrender.com/portal.html) |
| Permit login | [Open Permit Management](https://laoag-engineering-permits.onrender.com/login) |
| Queue login | [Open Queue Management](https://laoag-engineering-queue.onrender.com/log-in.html) |
| Queue monitor | [Open public monitor](https://laoag-engineering-queue.onrender.com/monitor.html) |
| Neon project | `laoag-engineerings-office` — PostgreSQL 18, AWS Singapore |
| Permit database | `laoag_permits_test` |
| Queue database | `laoag_queue_test` |

Both Render services use the Free plan in Singapore, with automatic deploys off.
The latest application commit is `d0abe868f27810b2db6418a926de3ea7765932ca`.
Both services are live on this commit, with the actual Permit and Queue origins
configured. Both health endpoints, login pages, hosted navigation and security
headers passed verification. Served frontend assets match the exact committed
files, including Building inspection controls and the Routing Matrix / Inspections
tabs. This update also includes the current Appearance placement, regular lot-number
text, Occupancy status badges and inspection card design.

The additive `permit_inspections` migration is applied to `laoag_permits_test`.
There are now **22 Permit tables** and **6 Queue tables**. Its `permit_id` foreign
key points to `permits.id`, and its cascade and runtime permissions were verified.
All 355 rows in the 21 existing Permit tables were unchanged by the migration.
The Queue video records match their pre-deployment backup, and the enabled clip
still delivers a playable video. No database restore or reset was performed.

Before this release, consistent backups captured 355 Permit rows and 1,005 Queue
rows across their respective tables. Private backup directory:

`C:\Users\Majin\PermitManagementPostgresBackups\pilot-pre-inspections-20261012075142459-a3ca506a`

Release checks passed: **244 frontend checks**, **14 backend unit checks**,
**15 PostgreSQL inspection checks**, and **12 PostgreSQL bulk-deletion checks**.
Signed-in acceptance checks remain available in [Building inspection UAT](BUILDING-INSPECTIONS-UAT.md).
The previous application commit `002a504` remains available for a code rollback;
keep the additive inspection table and any new records if reverting the code.

The earlier 12 October update clears stale cookies and consumes the replacement notice
once, adds staff video deletion with confirmation and monitor updates, and moves
the portal service cards beneath the office header. It also includes the locally
tested audit-log rendering, login handling and HTTP security improvements.
That earlier release passed 234 frontend checks and 42 targeted backend checks.
It required no database migration. The Building inspection release above adds
its separate table without restoring or resetting records. The existing cloud
video remained available during verification. See [update acceptance tests](OCT12-UPDATE-UAT.md).

The fresh database archives were restored and verified against their table data
checksums, foreign keys and identity sequences. The one backed-up local video
(8,038,054 bytes) was uploaded to the existing Cloudinary account. Its existing
playlist record now uses the cloud URL, retaining its ID, name, enabled state
and position. Playback was checked on the hosted monitor. New staff uploads
also use Cloudinary; no uploaded files depend on Render's temporary filesystem.

Queue was then restarted through Render. Both services remained healthy, the
video remained in the public playlist, and both database copies still matched
their backup checksums and identity sequences after accounting for that one
intentional video-path change. All 324 Permit rows and 1,000 Queue rows across
their respective tables were retained.

Use existing copied staff accounts for hosted acceptance tests. Authentication,
permit workflows, queue actions and reports still need the normal signed-in UAT;
successful hosting checks do not replace those tests.

## Prepared on 11 October 2026

The latest source and both published React builds are ready. All 230 frontend
checks passed. The deployment-related backend checks also passed.

Fresh verified backup directory:

`C:\Users\Majin\PermitManagementPostgresBackups\pg-office-20261011065114-8c421567a83c`

| Database copy | Archive | Tables | Total rows across all tables |
| --- | --- | --- | --- |
| Permit | `permit_system_migration.dump` | 21 | 324 |
| Queue | `queue_system_migration.dump` | 6 | 1,000 |

Both archives were restored into isolated temporary databases and compared for
schema, data checksums, relationships and identity sequences. All checks passed;
the temporary databases were then removed. One local video is in `media/`.
The archives already include session notices, queue reports and playlist schema.

The clean code snapshot is staged privately in `.deployment/`. It includes current
uncommitted fixes, lockfiles, source and published frontend, but excludes the
original Git history, dependencies, credentials, database/client archives, local
migration reports and uploaded media. The original checkout and remote stay intact.

## 1. New Neon project and two databases

1. Create a free project named `laoag-engineerings-office`.
2. Select PostgreSQL **18** to match these local backups. Choose Singapore if
   available, or the closest available region.
3. On the default branch, create `laoag_permits_test` and `laoag_queue_test` with
   the same project owner role. Both destinations must be empty.
4. Open **Connect** for each database and turn **Connection pooling OFF**. Keep
   both complete URLs private. Their host must not contain `-pooler`, and their
   database names must differ.

Use direct connections for both restoring and the application. The application's
startup timezone/timeout options caused `08P01` with the previous pooled endpoint.

## 2. Restore the fresh archives using pgAdmin

Register the new Neon server in pgAdmin with the direct hostname, port `5432`,
owner role/password and SSL enabled. Right-click each new database > **Restore**:

| Neon database | Matching archive from the backup folder |
| --- | --- |
| `laoag_permits_test` | `permit_system_migration.dump` |
| `laoag_queue_test` | `queue_system_migration.dump` |

Enable **Do not save Owner** and **Privileges** (`--no-owner --no-privileges`).
Keep pre-data, data and post-data enabled. Leave clean/drop disabled. Enable
single-transaction and exit-on-error if available, then confirm restore succeeds.
Do not apply older schema scripts over these complete restored databases.

Run this in each destination's Query Tool:

```sql
SELECT current_database();
SELECT COUNT(*) AS tables
FROM information_schema.tables
WHERE table_schema = 'public' AND table_type = 'BASE TABLE';
```

Immediately after restoring the 11 October archives, expect 21 Permit tables and
6 Queue tables. Before starting the latest code, run
`backend/migration/permit-inspections.sql` as the owner in the Permit database's
`public` schema. This adds the Building inspection table and brings Permit to 22
tables. Also apply `backend/migration/permit-checklists.sql` to add Building
requirements storage and bring Permit to 23 tables. Grant the application's role
table CRUD and identity-sequence USAGE/SELECT
if it differs from the owner. The current pilot already has this migration.
Inspect restore errors before retrying; do not delete existing records to force
the counts to match.

## 3. New private GitHub repository

Use `majingamo/laoag-engineerings-office`, private and initially empty. The clean
snapshot is pushed as `main`. Do not upload dumps, videos, `.env`, passwords or
historical client archives. Keep the complete backend structure and published
`frontend/monitorBP frontend` and `frontend/queue frontend` directories.

## 4. Create two Render web services

Use **New > Web Service** with the new repository and branch `main`. Grant Render
access to this specific private repository if it is absent from the list.

For both: runtime **Node**, root directory **empty**, region **Singapore**, plan
**Free**, health check `/api/health`, auto-deploy **off** during setup.

| Service | Suggested name |
| --- | --- |
| Permit | `laoag-engineering-permits` |
| Queue | `laoag-engineering-queue` |

Permit build:

```sh
npm --prefix backend/database ci && npm --prefix "backend/monitorBP backend" ci
```

Permit start:

```sh
node "backend/monitorBP backend/monitorServer.js"
```

Queue build (Permit dependencies provide shared authentication):

```sh
npm --prefix backend/database ci && npm --prefix "backend/monitorBP backend" ci && npm --prefix "backend/queue backend" ci
```

Queue start:

```sh
node "backend/queue backend/queueServer.js"
```

Do not use the Windows `npm start` launcher in Render. Render supplies `PORT` and
`RENDER_EXTERNAL_URL`. Do not set local `OFFICE_PG_CONNECTIONS`, `OFFICE_BIND_HOST`
or Windows media paths.

Set these on **both** services:

| Variable | Value |
| --- | --- |
| `NODE_VERSION` | `22` (latest patch in the verified local runtime's major version) |
| `NODE_ENV` | `production` |
| `DB_ENGINE` | `postgres` |
| `PERMIT_DATABASE_URL` | Private direct URL for `laoag_permits_test` |
| `PERMIT_COOKIE_SECURE` | `true` |
| `TZ` | `Asia/Manila` |

Set these additionally on **Queue**:

| Variable | Value |
| --- | --- |
| `QUEUE_DATABASE_URL` | Private direct URL for `laoag_queue_test` |
| `QUEUE_VIDEO_STORAGE` | `cloudinary` |
| `CLOUDINARY_CLOUD_NAME` | Existing Cloudinary cloud name |
| `CLOUDINARY_API_KEY` | Existing Cloudinary API key |
| `CLOUDINARY_API_SECRET` | Existing Cloudinary API secret |

Keep secret values only in Render's private environment settings. Reuse the
existing Cloudinary account if available; deleting Render and Neon does not delete
Cloudinary. Do not choose paid plans for this test.

Deploy Permit first and check `/api/health` and `/login`. Then deploy Queue and
check `/api/health`, `/log-in.html` and `/monitor.html`. Queue signs in through
copied Permit staff accounts; it does not have a separate user database.

Optional: `render.yaml` defines both free services and prompts for secrets. Use
**either** manual service creation **or** the Blueprint, not both.

## 5. Link both actual URLs

After Render assigns URLs, set these on **both** services and redeploy:

| Variable | Value |
| --- | --- |
| `PERMIT_PUBLIC_ORIGIN` | Actual Permit HTTPS origin, no trailing slash |
| `QUEUE_PUBLIC_ORIGIN` | Actual Queue HTTPS origin, no trailing slash |

Do not guess the URLs or reuse deleted services' addresses. Click **Back to
portal** from both logins and verify both portal cards open the actual cloud sites.
No link should open `localhost`.

## 6. Restore video playback and test persistence

The dump holds metadata; a local `uploads/...` file cannot play on Render. As an
operator, admin or superadmin, open Queue's video page, upload the backed-up clip
from `media/`, preview it and choose its order. Disable an unavailable old local
entry if needed. Existing Cloudinary URLs remain playable without re-uploading.

Redeploy Queue and verify the video and tickets remain. Records persist in Neon,
and new videos persist in Cloudinary; Render's free filesystem is temporary.

## 7. Hosted acceptance tests

Use different accounts in separate browser profiles/devices. Check both logins,
roles, logout and session replacement; copied permits/accounts/tickets/history;
UAT permit edits and admin approval; remarks and printed display names; all three
queue windows and monitor isolation; reports with Manila dates; CSV/Excel exports;
and operator video upload/preview/reordering/toggling after a restart.

Separate Render domains have separate cookies. Signing in again on the same
account intentionally replaces its prior session across both systems. Use distinct
staff accounts for simultaneous work. Free services can sleep, take time to wake,
and share the workspace's monthly free instance-hour allowance.

References: [Render web services](https://render.com/docs/web-services),
[Blueprint specification](https://render.com/docs/blueprint-spec),
[Node version configuration](https://render.com/docs/node-version),
[Free limits](https://render.com/docs/free),
[Neon PostgreSQL migration](https://neon.com/docs/import/migrate-from-postgres),
[Cloudinary uploads](https://cloudinary.com/documentation/node_image_and_video_upload).
