# IT handoff and fresh PostgreSQL setup

The private repository contains the application code, published browser files, and SQL schema. A fresh office installation needs no records or backups from the Render pilot or another workstation. IT creates two empty PostgreSQL databases and the first staff account.

## Set up a Windows test host

Clone the repository to the host and check out the release IT intends to run. Use Node.js 22 and PostgreSQL 18 with the command-line tools. The included PowerShell scripts expect PostgreSQL on `localhost:5432`, with its tools in the standard Windows installation directory. Run the commands below from the repository root using the Windows account that will launch both apps. Its encrypted connection settings are tied to that Windows user and machine.

Install the runtime dependencies and start the PostgreSQL Windows service.

```powershell
npm.cmd --prefix "backend/database" ci
npm.cmd --prefix "backend/monitorBP backend" ci
npm.cmd --prefix "backend/queue backend" ci
npm.cmd --prefix "backend/migration" ci
```

Run the setup commands in order on a fresh PostgreSQL instance. `Configure-Postgres.ps1` prompts for the local PostgreSQL administrator password. `Prepare-Postgres.ps1` creates the databases and limited application logins. The three `Apply` scripts install the schema and grants. Stop and inspect any error before continuing. If the target databases already exist, determine their purpose before running setup.

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\backend\migration\Configure-Postgres.ps1
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\backend\migration\Prepare-Postgres.ps1
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\backend\migration\Apply-PostgresSchema.ps1
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\backend\migration\Apply-PermitStationWorkflow.ps1
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\backend\migration\Apply-QueueFeatures.ps1
```

| Database | Used by | Stores |
| --- | --- | --- |
| `permit_system_migration` | Permit and Queue | Building and occupancy records, staff accounts and sessions, and permit history |
| `queue_system_migration` | Queue | Tickets, workstation and queue activity, client history, and playlist metadata |

The apps validate the PostgreSQL schema at startup. Start Permit first and
then Queue. Run one command per PowerShell terminal and keep both open.

```powershell
npm.cmd --prefix "backend/monitorBP backend" start
npm.cmd --prefix "backend/queue backend" start
```

Check for `success: true` from both services. The Windows launchers bind to
loopback for testing on the host.

```powershell
Invoke-RestMethod http://localhost:3000/api/health
Invoke-RestMethod http://localhost:5000/api/health
```

## Update an existing local installation

For an existing local installation upgrading to service-only tickets and permit
contacts, stop both Node services and run the following owner migrations. They
retain existing permits, ticket history, request approvals, and identifiers.
The fresh-schema setup above already includes these changes.

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\backend\migration\Apply-PermitContacts.ps1
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\backend\migration\Apply-PermitProcessing.ps1
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\backend\migration\Apply-QueueFeatures.ps1
```

Contact details and processing categories are stored on the permit records.
New queue tickets store their service and operational state. Old personal
fields remain in historical records. Service Summary counts issued
tickets from the live and archived tables in one database snapshot, filtered by
registration date in Asia/Manila. Resetting the active queue keeps those counts.
The deadline counts weekdays starting after the registration day in Manila.
Weekday holidays currently count toward the deadline.

## Activate the first Superadmin

1. On the test host, the designated IT account owner opens [Permit sign-in](http://localhost:3000/login), selects **Request Access**, and submits an **Administrator** request with their own password. The app stores a bcrypt hash and the request stays pending.
2. A PostgreSQL administrator connects to `permit_system_migration` in pgAdmin or `psql`. Look up the exact username in `public.users` and verify its numeric ID, role `admin`, `is_verified = 0`, and `is_active = 0`. Run the example below with the verified ID and exact username in place of `123` and `it-bootstrap`. Commit only if the update returns exactly the expected row. Otherwise roll back and investigate.

   ```sql
   BEGIN;
   UPDATE public.users
   SET role = 'superadmin', is_verified = 1, is_active = 1
   WHERE id = 123 AND username COLLATE "C" = 'it-bootstrap'
     AND role = 'admin' AND is_verified = 0 AND is_active = 0
     AND NOT EXISTS (SELECT 1 FROM public.users WHERE role = 'superadmin')
   RETURNING id, username, role;
   -- Run COMMIT; after verifying the returned row, or ROLLBACK; otherwise.
   ```

3. Sign in to Permit with that account and confirm the Superadmin console opens. Create or approve the remaining accounts from **Manage Accounts** or **Account Requests**. Give each staff member their own account and assign the stations they need.

## Prepare shared office access

For an office server, have IT provide the staff-facing HTTPS addresses and supervise both Node processes. The direct entry points are `backend/monitorBP backend/monitorServer.js` and `backend/queue backend/queueServer.js`. For IT-managed PostgreSQL connections, give Permit its `PERMIT_DATABASE_URL` and give Queue both `PERMIT_DATABASE_URL` and `QUEUE_DATABASE_URL`. Keep these values in the service's secret configuration. The URL-based PostgreSQL connection verifies TLS certificates. Apply the equivalent repository schema and grants as the database administrator before starting the apps.

Set `PERMIT_PUBLIC_ORIGIN` and `QUEUE_PUBLIC_ORIGIN` on both services so portal links use the office addresses. For HTTPS, set `PERMIT_COOKIE_SECURE=true` on both services. If a reverse proxy is used, it must support Socket.IO WebSocket connections for Queue. See [security configuration](../SECURITY-CONFIGURATION.md) before setting proxy trust.

Before handoff, sign in with an Operator and a Superadmin, verify both registries and reporting, and issue and call a synthetic ticket at each window from a separate account. Check the announcements through the actual monitor speakers. Configure backups for both PostgreSQL databases and perform a restore into separate databases. Keep the Render pilot for synthetic test records. [Acceptance checklist](../LOCAL-UAT-CHECKLIST.md) · [Test results](../FULL-LOCAL-UAT-2026-11-19.md) · [Backup and recovery](../POSTGRES-BACKUP-RECOVERY.md)
