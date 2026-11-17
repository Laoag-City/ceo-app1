# Office of the City Engineer

Laoag City’s Building and Occupancy Permit system and service-window queue.
The printable staff guide covers sign-in, daily work, account management,
Windows startup, and recovery. [Open the operations guide (PDF)](docs/office-operations-guide.pdf)

Setting up a new IT host? Follow the [IT handoff and fresh PostgreSQL setup](docs/it-handoff.md) to create empty databases, activate the first Superadmin, and verify both services.

| Role | Where to start |
| --- | --- |
| Operator | Open Building Permits or Occupancy Permits to file applications and review assigned stations. For Queue, choose Registration Desk or your assigned service window. |
| Admin | Open the Permit Admin console to review requests, approve or return projects, and export monthly reports. Station edits require a matching assignment. |
| Superadmin | Open Account Requests and Manage Accounts in Permit to approve access, manage roles and activation, and assign stations. |

Staff use individual approved accounts. Signing in again with the same account
ends its previous session across Permit and Queue. The public Queue display
opens without a staff sign-in and announces calls automatically when its browser
allows autoplay. If the browser blocks sound, click the monitor once and test a call.

| Service | Local Windows host | Render test site |
| --- | --- | --- |
| Permit sign-in | [localhost:3000/login](http://localhost:3000/login) | [Permit sign-in](https://laoag-engineering-permits.onrender.com/login) |
| Queue sign-in | [localhost:5000/log-in.html](http://localhost:5000/log-in.html) | [Queue sign-in](https://laoag-engineering-queue.onrender.com/log-in.html) |
| Public Queue monitor | [localhost:5000/monitor.html](http://localhost:5000/monitor.html) | [Queue monitor](https://laoag-engineering-queue.onrender.com/monitor.html) |

Use the address provided by IT for shared office work. Use synthetic records on
the Render test sites.

## Start both services on Windows

The local setup uses Node.js 22 and PostgreSQL 18. Complete the
[one-time database setup](docs/it-handoff.md#set-up-a-windows-test-host) before
starting the services on a new host.

Install runtime dependencies from the repository root on a fresh checkout.

```powershell
npm.cmd --prefix "backend/database" ci
npm.cmd --prefix "backend/monitorBP backend" ci
npm.cmd --prefix "backend/queue backend" ci
```

With the PostgreSQL Windows service running, open two PowerShell terminals
at the repository root. Run one start command in each terminal and keep both
open.

```powershell
npm.cmd --prefix "backend/monitorBP backend" start
npm.cmd --prefix "backend/queue backend" start
```

The launcher reads the current Windows account’s encrypted configuration from
`PermitManagementConfig\postgres-migration-apps.json` under its user profile.
The local databases are `permit_system_migration` and `queue_system_migration`.
Check that the Permit and Queue health endpoints both return success.

```powershell
Invoke-RestMethod http://localhost:3000/api/health
Invoke-RestMethod http://localhost:5000/api/health
```

**EADDRINUSE** means the port is already occupied. Open the affected page to see
whether the app is running. To restart an existing copy, press **Ctrl+C** in its
original terminal and run its start command again. If needed, use
`Get-NetTCPConnection -LocalPort 3000 -State Listen` to identify the owning
process. Use port 5000 for Queue.

## Backups and releases

On the configured Windows host, `npm.cmd --prefix "backend/monitorBP backend" run backup:create`
takes a fresh backup and verifies an isolated restore. Check the result and keep
a protected off-device copy of the verified backup folder. [PostgreSQL backup and recovery](POSTGRES-BACKUP-RECOVERY.md)

For the test sites, check the target commit and required migrations before using
**Manual Deploy** in Render. Verify health, sign-in, and the monitor after
deploying. [Render deployment and rollback](RENDER-DEPLOYMENT.md)

## Project structure

```text
backend/
  monitorBP backend/       Permit server, authentication, database workflows
  queue backend/           Queue server, ticket workflows, Socket.IO
frontend/
  portal-react/            EDITABLE frontend source and build tools
    src/                  Landing portal
    system/
      features/           Pages grouped by purpose
      shared/             Sidebar and React/legacy compatibility bridge
      assets/             Editable styles and browser helper scripts
      tests/              Frontend checks
      reference/          Historical migration material — do not edit/run
    dist/                 Generated portal build
    system-dist/          Generated system build
  monitorBP frontend/     Published files served by the permit server
  queue frontend/         Published files served by the queue server
```

The server folders remain in place to preserve existing URLs, startup commands,
uploads, and backend paths. Published frontend files are needed to run the system;
they are generated deployment copies, not a second source to maintain.

## Build and publish

Run in `frontend/portal-react` using `npm.cmd` in PowerShell:

```powershell
npm.cmd run publish:system
```

For the landing portal:

```powershell
npm.cmd run publish:local
```

Then refresh the page. Backend restarts are not needed for these frontend changes.
Neither command modifies database records or restarts a running server.

## Documentation

- Page map and everyday editing instructions. [Where to edit](WHERE-TO-EDIT.md)
- Architecture, workflows, and database. [System overview](SYSTEM-OVERVIEW.md)
- Implementation responsibilities. [Code documentation](CODE-DOCUMENTATION.md)
- Frontend source and publishing instructions. [Frontend architecture](frontend/portal-react/system/README.md)

Never commit credentials, private database backups, or uploaded confidential records.
