# Office of the City Engineer — start here

For small frontend edits, open [WHERE-TO-EDIT.md](WHERE-TO-EDIT.md).

## Start the PostgreSQL system (updated 1 October 2026)

Run `npm.cmd start` in each backend folder, in separate PowerShell terminals:
`backend/monitorBP backend` and `backend/queue backend`. Leave both terminals open.
The launcher decrypts this Windows user's local connection configuration; do not
start the Node entry files directly without that configuration.

Open http://localhost:5000/portal.html or http://localhost:3000/login.
The active PostgreSQL databases retain the names `permit_system_migration` and
`queue_system_migration`. PostgreSQL must be running; pgAdmin may be closed.
MySQL is retained for rollback only and is no longer updated by the websites.
See [POSTGRES-MIGRATION.md](POSTGRES-MIGRATION.md) for the cutover record and
[POSTGRES-BACKUP-RECOVERY.md](POSTGRES-BACKUP-RECOVERY.md) for recovery.

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

- [Where to edit](WHERE-TO-EDIT.md): page map and everyday editing instructions.
- [System overview](SYSTEM-OVERVIEW.md): architecture, workflows, database and operation.
- [Code documentation](CODE-DOCUMENTATION.md): implementation responsibilities.
- [Frontend architecture](frontend/portal-react/system/README.md): source/publishing contracts.

Never commit credentials, private database backups, or uploaded confidential records.
