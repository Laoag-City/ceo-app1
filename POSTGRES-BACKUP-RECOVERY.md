# PostgreSQL backup and recovery

Implemented 1 October 2026. This guide applies to PostgreSQL, not the old MySQL
backup scripts. The current targets are `permit_system_migration` and
`queue_system_migration`. Review those names when changing deployment configuration.

## What is backed up

- Both complete PostgreSQL databases in compressed custom-format `.dump` archives.
- Tables, records, account password hashes, indexes, constraints, identities,
  collations, functions and triggers.
- Every distinct video file referenced by the queue's `videos` table. Preview
  uploads take precedence over original uploads, matching the preview server.
- A manifest with archive/media SHA-256 checksums and per-table record checksums.
- A recovery report describing what was restored and verified.

The program uses PostgreSQL `pg_dump --snapshot` with an exported read-only
transaction snapshot, so its row checksums describe the same records as the dump.
The two databases have independent snapshots; this is not a cross-database atomic
snapshot or continuous point-in-time recovery. A final migration cutover still
requires a brief coordinated pause in writes.

The permit backend's npm shortcuts use this PostgreSQL workflow and cover both
databases plus local queue videos:

```powershell
npm.cmd --prefix "backend/monitorBP backend" run backup:create
npm.cmd --prefix "backend/monitorBP backend" run backup:list
npm.cmd --prefix "backend/monitorBP backend" run backup:verify -- <backup-id-from-the-list>
```

`backup:create` also verifies a restore into disposable databases. The old
`maintenance/permit-backup.js` utility is retained only for historical MySQL
backups; it does not back up the current PostgreSQL databases.

Backups are stored here, outside the website and OneDrive project:

`C:\Users\Majin\PermitManagementPostgresBackups`

The wrapper restricts folder permissions to the current Windows account, SYSTEM,
and Administrators. These archives contain confidential information. They are
compressed, **not encrypted by this tool**. Keep them private. A backup on the same
computer does not protect against loss of that computer/drive; an external or
off-device copy is still needed. No backups are automatically deleted currently.

Database login credentials are not exported. The wrapper reads the existing
Windows DPAPI configuration from `C:\Users\Majin\PermitManagementConfig` and passes
the password only to child-process environments. DPAPI credentials are tied to the
Windows user/machine; they are not portable disaster-recovery credentials.

## Automatic daily job

Windows Task Scheduler task: **Office PostgreSQL Verified Backup**.

- Daily at **02:00 Manila time**, with missed runs started when available.
- Runs under Majin's Windows account while that account is signed in; the computer
  must be awake. Codex, pgAdmin and the Node website servers need not be open.
- The PostgreSQL Windows service must be running.
- Every run creates a backup and performs an isolated restore drill.
- Duplicate runs are blocked by Task Scheduler and an exclusive operation lock.
- This is not yet a service-account job capable of running while signed out.

Check Task Scheduler's **Last Run Result** (0 means the wrapper succeeded), plus:

`C:\Users\Majin\PermitManagementPostgresBackups\latest-operation.json`

The result must show `status: passed`. A new backup folder by itself does not prove
that verification completed. Each valid backup has `manifest.json` with
`status: backup-complete` and a passed `recovery-*.json` report.

The report's `verificationChecks` identifies each database's record, schema and
foreign-key comparison. A successful drill has `dataMatches`, `schemaMatches` and
`foreignKeysMatch` all `true`, every database `verified: true`, and
`temporaryDatabasesRemoved: true`. Its top-level `status` must still be `passed`;
partial checks alone are not sufficient. Copy the complete successful backup
folder, including its manifest, dump files, media and recovery report, to your
chosen private off-device backup location.

## Manual commands

Create a fresh backup and automatically verify it by restoring:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "C:\Users\Majin\OneDrive\Desktop\OJT Projects Final\backend\migration\Postgres-Backup.ps1" -Action backup
```

List existing backups and verify their file checksums:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "C:\Users\Majin\OneDrive\Desktop\OJT Projects Final\backend\migration\Postgres-Backup.ps1" -Action list
```

Repeat the recovery drill for a particular backup (replace BACKUP-ID):

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "C:\Users\Majin\OneDrive\Desktop\OJT Projects Final\backend\migration\Postgres-Backup.ps1" -Action verify -BackupId "BACKUP-ID"
```

Backup IDs look like `pg-office-20260930214627-7e3d29fd20c7`; the time in the ID is
UTC. That example was created on 1 October, 05:46 Manila time.

## If a database is lost: recover to new databases first

1. Stop application writes and preserve the backup folder. Install/start PostgreSQL
   18 if necessary. On another PC, configure new local PostgreSQL administrator
   credentials; do not expect the old DPAPI configuration to decrypt there.
2. Place a complete trusted backup folder under the private backup root. Keep its
   manifest, dump files and media subfolder together. Check it with `-Action list`.
3. Run the following, replacing BACKUP-ID:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "C:\Users\Majin\OneDrive\Desktop\OJT Projects Final\backend\migration\Postgres-Backup.ps1" -Action restore-new -BackupId "BACKUP-ID"
```

4. The command creates uniquely named `office_restore_permit_...` and
   `office_restore_queue_...` databases, validates them, and **keeps them** for review.
   It also creates a `recovered-media-...` directory and records its path. It never
   overwrites or drops an existing application database.
5. Review the returned report and recovered records in pgAdmin. Restored databases
   are owned by a generated NOLOGIN role and intentionally have no application
   access. The restore skips old ownership/ACLs so it does not require the old
   runtime roles or passwords to exist on a replacement server.
6. Before activating recovery, create/reconfigure the limited runtime accounts,
   reapply their table/sequence grants and queue-reset function EXECUTE grant,
   restore media to the chosen deployment directory, and clear restored login
   sessions/presence/workstation state. The existing migration scripts show the
   required role privileges; do not use the postgres administrator for the websites.
7. Choose the final database names and update the connection configuration and
   backup target allowlist together. The current backend intentionally accepts only
   migration/test database names. If the original databases are truly absent, an
   administrator can rename the verified replacements to those configured names;
   do not rename over an existing database. Test before restarting office access.

Activation remains a deliberate deployment step. Restoration brings data back to
the backup time; newer changes require separate reconciliation. Database roles,
service configuration, application source and Windows task setup are deployment
assets, not restored automatically by these database archives.

## What verification proves

Each drill first checks archive/media integrity, then restores with `pg_restore`
into newly created databases as a temporary NOSUPERUSER/NOLOGIN owner. It compares
all restored row values through canonical per-table checksums and checks schema
definitions, foreign-key counts, triggers, functions, indexes and collations.
The verifier recognizes the equivalent whole-array and per-element text casts in
literal-list CHECK constraints. PostgreSQL documents their equivalence in
[Array Constructors](https://www.postgresql.org/docs/18/sql-expressions.html#SQL-SYNTAX-ARRAY-CONSTRUCTORS).
This avoids a false mismatch after dumping and reparsing the final-review checks.
Constraint names, types, validation state, allowed values and all other schema
components remain checked. New backup manifests contain component hashes and
constraint definitions so failures can identify the differing component without
printing personal records. Older manifests retain exact schema-hash comparison.
It checks that restored identity positions are not behind the recorded source
watermarks and exceed the greatest restored IDs, without consuming an ID.
Media is copied into a separate recovery directory and checked again.

Successful drills remove only the uniquely named databases/role and media copies
created for that drill. `restore-new` keeps its verified replacements. ACLs are
intentionally restricted on recovered databases; application permission checks are
required during activation. Use these commands only for trusted local backups.

## Failure handling

- A failed or incomplete backup is never reported as verified. `list` labels it
  `incomplete-or-checksum-failed`; it does not prevent listing other valid backups.
- Missing/changed media, altered archives, schema/data differences and unsafe paths
  stop recovery. Existing application databases are never selected as restore targets.
- On failure inspect `latest-operation.json` and the affected backup's recovery
  report. A process interruption can leave a `.operation.lock` file or temporary
  database. Confirm the recorded process has ended before removing a stale lock;
  inspect any temporary resources before manual cleanup.
- Moving the project or changing Windows accounts requires updating/reinstalling
  the scheduled task and validating credential access.

## Code map

- `backend/migration/Postgres-Backup.ps1`: private directory ACL and credential wrapper.
- `backend/migration/postgres-backup.cjs`: backup, manifest validation, safe fresh
  restore, checksums, sequence checks, media recovery and temporary cleanup.
- `backend/migration/Install-PostgresBackupTask.ps1`: daily Windows task registration.
- `backend/migration/postgres-backup.test.cjs`: rejects invalid IDs, incomplete
  backups, changed archive bytes and archive-path tampering before a restore begins.

PostgreSQL references: [pg_dump](https://www.postgresql.org/docs/18/app-pgdump.html)
and [pg_restore](https://www.postgresql.org/docs/18/app-pgrestore.html).
