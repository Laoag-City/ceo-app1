# PostgreSQL migration preparation — 30 September 2026

For a fresh installation with empty databases, start with the
[IT handoff guide](docs/it-handoff.md). This page records the original MySQL-to-PostgreSQL cutover.

Status: fresh MySQL backups verified; source schema inventoried; Steps 1 and 2
(empty PostgreSQL schemas) complete. Live-record transfer completed and verified.
PostgreSQL backend preview implemented and automated acceptance tests passed.
PostgreSQL backup/restore drill passed on 1 October 2026; daily Windows backup task
installed. See POSTGRES-BACKUP-RECOVERY.md for commands, verification and recovery.
Normal-port cutover completed on 1 October 2026: permit 3000, queue 5000.
PostgreSQL is now the default; the sections below record the earlier migration stages.

## Normal-port cutover — 1 October 2026

After user acceptance, all four old/preview web servers were stopped. A final
read-only comparison found no MySQL-only permanent records. PostgreSQL retained
BP-53, its lot/import receipt and the BP-52 title edit; other permanent records
matched. No old backup or fresh copy overwrote those changes.

Fresh PostgreSQL backup `pg-office-20260930220659-2502ea603d40` passed restore
verification: permit 18 tables/129 rows/11 foreign keys, queue 5 tables/934 rows,
and 3 media files. Fresh MySQL rollback backups also passed their recovery drill.
Temporary PostgreSQL sessions, presence and window leases were then cleared.

Run `npm.cmd start` from each backend folder in separate terminals. This invokes
`backend/migration/Start-Postgres.ps1`, decrypts per-user Windows credentials and
starts the selected server on 3000 or 5000, bound to loopback. Sign in again.
Direct Node invocation without connection configuration now fails closed instead
of silently selecting MySQL. These processes are not installed as startup services.

Active databases remain `permit_system_migration` and `queue_system_migration`;
their names do not imply that the application still uses MySQL. Media continues
in `backend/migration/preview-uploads`, with original uploads as a fallback.
Do not remove that directory. Ports 3001/5001 are no longer needed for daily use;
the preview launcher uses the same active databases, not an isolated sandbox.

MySQL is preserved but no longer synchronized. Rollback requires stopping both
PostgreSQL servers and reconciling all later PostgreSQL writes before explicitly
selecting `DB_ENGINE=mysql`; simply restarting old MySQL would lose visibility
of the new import and other changes. Do not delete either database set.

Post-cutover checks: permit health/login, queue login/playlist and portal returned
HTTP 200. Only 3000/5000 retained listeners; 3001/5001 were stopped. All 14
PostgreSQL acceptance groups passed against the separate `*_system_test` databases,
covering role/session enforcement, permit workflows/import/export and queue flow.

## Step 1 completed

Prepared `permit_system_migration` and `queue_system_migration`, both UTF-8 and
owned by the database administrator. Both initially had zero application tables. Verified
connections as `permit_app_migration` and `queue_app_migration` respectively.
These application roles initially received CONNECT and public-schema USAGE; no superuser,
database creation, role creation, replication, bypass-RLS, or schema-create rights.
Step 2 added table CRUD and sequence USAGE/SELECT privileges.
PUBLIC database privileges and public-schema privileges were revoked on these
two new databases only.

Encrypted application credentials are in
`C:\Users\Majin\PermitManagementConfig\postgres-migration-apps.json`.
`backend/migration/Prepare-Postgres.ps1` created and verified the databases. It
refuses to overwrite existing configuration, databases, or roles. Do not rerun it
to reset an existing setup. No MySQL records, application connection settings, or
running services were changed.

## Step 2 completed: empty schemas

- `permit_system_migration`: 18 tables, 112 columns, 11 foreign keys.
- `queue_system_migration`: 5 tables, 26 columns, no source foreign keys.
- Tables were empty at Step 2. Runtime roles passed rollback-only fixture tests;
  the live-record transfer below subsequently populated the permanent tables.
- Primary keys, index counts, identity counts, column counts and restricted role
  flags match the reviewed inventory. Tests exercised case-insensitive username
  uniqueness, foreign-key rejection/cascade, JSON validation, checklist timestamp
  updates, queue status validation/defaults, CRUD, and denied schema creation.

Files in `backend/migration/`:

- `generate-postgres-schema.cjs`: converts the inventory to reviewable SQL; rejects
  unknown column types/defaults/checks instead of guessing.
- `permit_system_migration.sql`, `queue_system_migration.sql`: generated schemas.
- `postgres-common.ps1`: psql connection and Windows credential-decryption helper.
- `Apply-PostgresSchema.ps1`: applies schemas to the two named migration databases.
  Each database is one transaction; existing tables cause refusal. If the second
  database fails, the first remains committed: inspect before any retry.
- `Verify-PostgresSchema.ps1` and `verify-*-schema.sql`: metadata and rollback-only
  runtime-role tests. Explicit test IDs leave sequences untouched.
- `postgres-schema-verification.json`: actual verification results, no account data.

Conversion decisions and remaining compatibility gates:

- Identity starts retain the inventory's source AUTO_INCREMENT watermarks. Refresh
  these and reseed again during data transfer; the MySQL system is still live.
- MySQL TIMESTAMP becomes timestamp(0) with time zone; DATETIME retains its precision
  without a timezone; DATE remains DATE. Transfer must read MySQL TIMESTAMP in UTC
  and explicitly reconcile local DATETIME/session semantics before backend tests.
- JSON columns remain text with PostgreSQL IS JSON checks, preserving stored text.
- Tinyint flags remain smallint, preserving numeric API values and signed tinyint
  range. Queue status remains text with an allowed-value check.
- Case/accent-insensitive text uses ICU `und-u-ks-level1`. This is an approximation
  of MySQL general_ci, not exact equivalence (notably trailing spaces and some
  Unicode comparisons). Before import, check unique-key collisions; backend search
  operators and username normalization must be tested against this collation.
- `project_records.id` uses nonnegative signed bigint identity. PostgreSQL bigint
  stops at 9223372036854775807, unlike MySQL unsigned bigint. Transfer MUST reject
  out-of-range values/watermarks before writing; do not silently round JS numbers.
- The checklist trigger preserves automatic updated_at behavior for changed rows;
  explicit different timestamps remain accepted. Setting exactly the old timestamp
  while changing other fields still activates the trigger (a MySQL edge difference).
- Runtime roles cannot create tables, truncate tables, or reset sequences. Queue
  reset must be ported using reviewed privileges/behavior, not an admin connection.

Do not change the working backends to PostgreSQL yet; their queries still need conversion.

## Step 3 completed: live records copied (not restored from backup)

On 30 September 2026 at 13:52 Manila time, `Copy-LiveRecords.ps1` and
`copy-live-records.cjs` read both current MySQL databases in one InnoDB read-only,
repeatable-read consistent snapshot. No backup file was used as data input.

- Permit: 121 permanent rows copied, including 4 building permits, 1 occupancy
  permit, 5 accounts and their existing password hashes, routing and history.
- Queue: 934 rows copied, including 13 tickets, 897 logs, 21 submission keys and
  3 video metadata records. Existing media files remain in their current directory.
- Excluded temporary state: 1 login session and 27 presence entries. The source
  workstation table contained zero rows. No source rows were deleted or changed.
- All copied columns were compared with the source snapshot, preserving NULLs,
  exact text, numeric values, dates and timestamps. Foreign keys and unique/check
  constraints stayed enabled. Bigints were handled without JavaScript rounding.
- Next building ID is 53; next occupancy ID is 7. All identity sequences were
  advanced to at least the live source watermark and maximum copied ID plus one.
- `Verify-CopiedRecords.ps1` independently confirmed committed counts and identity
  positions using limited runtime accounts. Detailed metadata-only results are in
  `backend/migration/postgres-live-transfer.json`.

Migration-only npm dependencies are isolated in `backend/migration/package.json`
and its lockfile. The running backend dependency files were not modified.
Plaintext database rows and passwords were not written to the project. Transfer
uses parameterized inserts and keeps row values in memory. The password is passed
through a child-only environment, not command arguments.

The copy script refuses an existing report or nonempty target. Do not rerun it to
refresh this copy. Both target transactions are validated before either commits,
but commits across separate databases are not atomic; the report tracks each one.
If a future run fails after one commits, inspect/reconcile rather than overwrite.
See the node-postgres transaction and query references below for driver behavior.

This was a point-in-time migration copy, not continuous synchronization. At this
stage the website still used MySQL. The final comparison and cutover are recorded above.

## Step 4: PostgreSQL backend preview (no live cutover)

During this preview stage, PostgreSQL required explicit `DB_ENGINE=postgres`.
The completed normal-port cutover changed the default to PostgreSQL.
The shared `backend/database/` module holds the PostgreSQL driver, parameter binding,
reviewed dialect conversions, registry JSON query and preview asset handling.
Existing API response shapes (`insertId`, `affectedRows`, row arrays) remain stable.
Transactions use a dedicated client/connection, not a shared request transaction.
This is a deliberately limited compatibility layer for this application's SQL,
not a general MySQL-to-PostgreSQL converter. New dialect-specific queries require
an explicit conversion and regression coverage.

PostgreSQL changes include ON CONFLICT upserts, parameterized $n placeholders,
INSERT RETURNING, date/JSON aggregation, transaction advisory locks for imports and
queue transitions, numeric flag/count handling, and a source-account row lock during
session issuance. Runtime CREATE TABLE calls check pre-created tables; they do not
perform schema migrations. Apply future PostgreSQL DDL with a reviewed admin script.

`queue-runtime.sql` installs a restricted SECURITY DEFINER reset function. It locks
queue operations, invalidates submission keys, clears queue/workstation rows and
restarts ticket numbering atomically. Only the queue runtime role receives EXECUTE;
the HTTP route still enforces admin/superadmin and exact RESET confirmation.

Preview endpoints (local loopback only):

- Permit: http://127.0.0.1:3001/login
- Queue/portal: http://127.0.0.1:5001/portal.html
- Queue selection: http://127.0.0.1:5001/log-in.html

Use the existing copied accounts/passwords. These previews write to the
`*_system_migration` databases, not MySQL. They have independent cookie names.
The launcher fixes Node/SQL timezone semantics to Asia/Manila. Preview asset
rewriting points legacy fixed-port links at preview ports; a connect-src policy
blocks accidental API requests to live ports. Page authorization precedes preview
static-file handling. Preview video uploads go to `backend/migration/preview-uploads`;
existing copied video references can still read the original uploaded files.
Published frontend assets are not rewritten on disk and need no rebuild for preview.

To restart previews, run each command in a separate PowerShell terminal and leave
it open. Ctrl+C stops that preview; the launcher passes decrypted credentials only
to its child environment, never shell arguments or permanent environment settings.

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "C:\Users\Majin\OneDrive\Desktop\OJT Projects Final\backend\migration\Start-PostgresPreview.ps1" -Service permit
```

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "C:\Users\Majin\OneDrive\Desktop\OJT Projects Final\backend\migration\Start-PostgresPreview.ps1" -Service queue
```

Automated tests use separate `permit_system_test` and `queue_system_test` databases
and ports 3002/5002. `Prepare-PostgresTest.ps1` created these from PostgreSQL migration
rows (no backup input), without disconnecting pgAdmin. It refuses existing test
databases. Do not rerun it as a reset command. `Start-PostgresPreview.ps1 -Service tests`
runs the acceptance suite; it hard-rejects migration/live database names and stops
its child servers afterward. It creates/removes fixture accounts and project rows;
queue reset tests intentionally reset only the disposable test queue.

Validation completed:

- 14 real PostgreSQL HTTP/SQL acceptance groups: role/login guards, profiles,
  presence, registry/detail date and JSON shapes, stations, stale edits, approvals,
  comments, inspections, checklists, concurrent import retry, CSV/Excel export,
  deletion approvals, queue ownership/transitions, concurrent calls and submissions,
  reset permissions, cross-service password revocation, protected pages and preview links.
- 82 existing-backend and SQL-binding tests pass. Two outdated queue test harnesses
  were updated to match the existing authorized routes and action-handler placement.
- Both original MySQL services (3000/5000) and previews (3001/5001) responded HTTP 200.
- Metadata-only PostgreSQL results: `backend/database/postgres-test-results.json`.

User acceptance, final comparison/write pause, media preservation and local cutover
are complete (above). The older maintenance backup scripts still target MySQL;
Postgres-Backup.ps1 is the PostgreSQL tool. Off-device backup copies, retention,
automatic web-server startup and office-network deployment remain separate work.

## Verified recovery point

- Permit: 18 tables, 149 rows, 11 foreign-key relationships.
- Queue: 5 tables, 934 rows; all 3 referenced media files copied and verified.
- Report: `C:\Users\Majin\PermitManagementBackups\office-recovery-2026-09-30T05-29-00-644Z.json`.
- Permit backup: `permit-backup-20260930T052858679Z-26dce88652e8`.
- Queue backup: `permit-backup-20260930T052859867Z-499f4216dac5`.

Both SQL dumps were restored into isolated temporary databases and checked.
Temporary restore resources were cleaned up. Live records were not altered.
An earlier LocalAppData attempt created a permit dump but did not pass path
verification because of Windows packaged-app redirection; use the verified
report above. The recovery drill now respects PERMIT_BACKUP_DIR.

## Local PostgreSQL connection

The initial passwordless psql probe was rejected; local encrypted credentials were
subsequently configured and successfully used for Step 1. pgAdmin's saved password
is not automatically available to application tools. Do not send passwords in chat.

For a fresh installation only (already completed on this machine):

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\backend\migration\Configure-Postgres.ps1
```

The policy override applies only to that process. This script prompts with masked
input, tests a read-only query, and stores Windows DPAPI-encrypted migration
credentials in `%USERPROFILE%\PermitManagementConfig\postgres-migration.json`.
It creates no databases and does not change application settings. It refuses to
overwrite existing credentials. The encrypted secret can only be used in the
appropriate Windows user/machine context; it is not a portable backup. Migration
tools must decrypt internally without logging the password. Runtime services
will use separate limited-access roles, not this administrator connection.

## Source inventory and conversion work

`backend/migration/inspect-mysql.cjs` reads metadata and row counts only and writes
`mysql-schema-inventory.json`. No password hashes, session tokens, or visitor rows
are exported into the project. Re-run before transfer because the source remains
live. Counts are an inventory, not a replacement for the consistent SQL backups.

Keep permit and queue databases separate. Queue authentication connects to the
permit account/session database through its own account pool. Preserve that
separation and the independent browser cookies.

Required conversions before switching:

- Replace mysql2 query/result handling with pg: parameterized $1 placeholders,
  result.rows, result.rowCount, INSERT RETURNING, and connection-owned transactions.
- Convert AUTO_INCREMENT to identities; import original IDs and reseed above
  both imported IDs and the source next-ID watermark. BP/OP numbers must not reset.
- Review signed/unsigned bigint ranges and JavaScript number conversion. Keep
  calendar DATE values as YYYY-MM-DD; explicitly reconcile MySQL timestamp/session
  timezone behavior before transfer. Preserve NULL versus empty string values.
- Preserve primary keys, unique constraints, foreign keys and deletion rules.
  Compare case/accent-insensitive MySQL username uniqueness with the intended
  PostgreSQL login behavior; do not silently make differently cased duplicates.
- Convert GROUP_CONCAT/JSON_OBJECT registry aggregation, INSERT IGNORE and ON
  DUPLICATE KEY retry handling, DATE_FORMAT/IF/LOCATE, interval expressions,
  metadata queries, and ON UPDATE timestamps. Preserve API response shapes.
- Replace GET_LOCK-based queue/import serialization with transaction-scoped
  PostgreSQL locking. Retest duplicate submissions and simultaneous clerks.
- Preserve account hashes, approval requests, record-version checks, import
  idempotency records, inspections, checklists, logs, profiles, media references.
  Do not carry active login/presence/workstation sessions into the cutover.
- Replace MySQL-specific backup/recovery tools with pg_dump/pg_restore and repeat
  the isolated restore drill on PostgreSQL before considering it recoverable.

Major affected modules: monitorServer, authServer, permitSessions, editWorkflow,
peopleProfiles, projectRecords, permitTransfer, inspectionWorkflow, stationDates,
adminOverview, queueServer, queue-service, ticket-submission, and maintenance tests.

## Transfer and acceptance sequence

1. Create isolated PostgreSQL migration databases and limited runtime roles.
2. Apply reviewed PostgreSQL schemas and load records preserving original keys (done for the migration snapshot).
3. Verify per-table counts, canonicalized values, key relationships, sequence
   watermarks, password verification, date values, and media checksums.
4. Run migrated backends on test ports. Exercise all roles, routing approvals,
   deletes, imports/exports, summaries, profile/password changes and queue actions.
5. Verify PostgreSQL backup restore. Keep the existing MySQL version available.
6. Schedule a brief write pause, refresh backups and repeat final transfer. Switch
   only after checks pass; require users to sign in again. Do not delete MySQL.

Rollback before PostgreSQL receives writes can return to the preserved MySQL
configuration. Once new PostgreSQL records exist, reconcile those writes before
rolling back; blindly switching databases would lose those changes.

References:
- https://node-postgres.com/features/queries
- https://node-postgres.com/features/transactions
- https://www.postgresql.org/docs/18/ddl-identity-columns.html
- https://www.postgresql.org/docs/18/backup-dump.html
