# Queue reports and video playlist

This guide records the original rollout. The current Queue release has retired
the Video Playlist. See the [IT handoff](../../docs/it-handoff.md) for current
setup and acceptance checks. The playlist SQL remains part of schema history.

The workstation chooser links to Reports and Video Playlist under Other Tools.
Both require an active operator, admin, or superadmin session. Video management
does not grant operators access to account administration, audit logs, or reset.

## PostgreSQL upgrade

Run from the repository root before restarting the Queue backend:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "backend/migration/Apply-QueueFeatures.ps1"
```

This owner migration applies `queue-runtime.sql` and `queue-playlist.sql` to the
configured local `queue_system_migration` database. It retains ticket, archive,
video, and session records. It adds visit identities/timestamps, retains those
fields in the owner reset function, and backfills video order from existing IDs.
It is repeatable. Runtime accounts only validate the schema at startup.

For the isolated PostgreSQL test database, use `-Database queue_system_test`.
`Verify-QueueWindows.ps1` exercises report timings, Manila midnight, and reset
preservation using temporary tables, alongside existing window-isolation tests.
For a separate hosted database, its owner must review and adapt the explicit
database guards and role grants in the two SQL files before applying them.

Restart the existing Queue terminal after the migration:

```powershell
npm.cmd --prefix "backend/queue backend" start
```

## Report definitions

- Dates select visits **registered** in the inclusive range in Asia/Manila.
  Counts reflect those visits' latest saved statuses, including archived visits.
- Date ranges are limited to 366 days. Window filters follow registered service.
- Average wait is registration to first call, for visits tracked after this
  upgrade. Recall does not restart the first-call timestamp.
- Average service uses finished, tracked visits only. Held time is excluded.
- Earlier visits remain in totals, but their timing is unavailable and excluded
  from averages. The page and CSV show each timing sample count.
- Queue reset retains visit UUIDs, timings, and outcomes. Reused ticket numbers
  receive a new visit UUID, and retried registrations do not increase counts.
- CSV and print use the report currently displayed. Print summarizes totals and
  windows; daily charts are omitted from print for ranges longer than 31 days.

## Playlist behavior

Uploads append to the end. Up/Down changes persist, including positions of
disabled clips. Enable/Disable retains the file and can be reversed. Preview
does not change what plays on the public monitor. Missing files are identified
in management and skipped by the monitor.

The public playlist includes enabled, playable URLs only. Playlist changes are
broadcast to monitors, and reconnecting monitors reload current state. If the
currently playing URL is still enabled, playback continues without restarting.
Local media lookup retains the existing upload-directory fallback; Cloudinary
storage settings remain supported. Video actions log the signed-in staff name.
