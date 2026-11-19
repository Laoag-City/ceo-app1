# Local acceptance checklist

Use the current version on a test host with synthetic records. For an empty host,
follow the [IT handoff guide](docs/it-handoff.md) before starting. Automated SQL
checks use disposable databases or connection-local temporary tables.

## Start the updated version

1. Stop the two existing server terminals with Ctrl+C.
2. Open two VS Code PowerShell terminals in the project folder.
3. Run one command in each terminal:

```powershell
npm.cmd --prefix "backend/monitorBP backend" start
```

```powershell
npm.cmd --prefix "backend/queue backend" start
```

4. Open Permit at `http://localhost:3000/login` and Queue at
   `http://localhost:5000/log-in.html`. Refresh open pages with Ctrl+F5.
5. Use records named `UAT ...`. Record their IDs/ticket numbers so they are easy to
   distinguish from existing work. Use a different verified account and isolated
   browser session for each queue window: for example Chrome, Edge, and Chrome
   Incognito. Ordinary tabs in one browser share login cookies.

## 1. Quoted titles and deletion requests — both permits

- [ ] Create a Building permit titled `UAT O'Brien "Annex" \ Test`, with valid
  required fields, today's filing date, and a lot number.
- [ ] Create an Occupancy permit with the same title and valid required fields.
- [ ] Click Delete on each record. The confirmation displays the entire correct
  title and record ID. Apostrophes, quotation marks, and backslashes display normally.
- [ ] Cancel once: the record stays and no request is created.
- [ ] Reopen and confirm the request: exactly one request appears for the admin,
  and the permit stays in the registry until approved.
- [ ] As an admin in another browser session, decline the Building test request.
  Its permit stays for the edit tests below. Approve deletion of the Occupancy
  **UAT record only**; only that record disappears.

## 2. Required fields, lengths, and valid permit approval

- [ ] In Building, edit the surviving UAT record. Attempt an empty/whitespace title
  and an empty lot list. Saving is blocked; existing values remain after refresh.
- [ ] Try a 256-character title when creating a permit in each registry. A clear
  validation error appears and no partial project or routing stations are saved.
- [ ] In Occupancy, try a 101-character building-permit reference. It is rejected.
- [ ] Submit a valid Building title edit and two valid lot numbers as an operator.
  It goes to the admin. After admin approval and refresh, the exact title and both
  lots are saved. Existing review/approval history remains available.
- [ ] On both permit workspaces, save a normal station remark and dates. Reopen
  the remark popup and print the summary. Existing remarks, dates, and display-name
  attribution still work.

Impossible dates, wrong input types, overlong lot numbers, direct admin edits,
and invalid historical approval requests were also tested automatically. Do not
alter saved request JSON or the database to reproduce those cases manually.

## 3. Three windows and the disappearing-ticket scenario

Start with distinct browser sessions/accounts assigned to Windows 1, 2, and 3.
Keep the public Monitor open in another tab.

- [ ] From Registration, issue two UAT tickets per window and note the six numbers:
  Use Receiving Bldg. Permit, Receiving Occupancy, or Inquiry for Window 1,
  Releasing Occupancy for Window 2, and Releasing Bldg. Permit for Window 3.
- [ ] Press Next ticket once in each window. Each A ticket is called in its own
  window and appears in Monitor's matching Now calling card. Each B ticket waits.
- [ ] Hold W2-A. W2-A moves to Window 2's On hold list. **W1-B and W3-B remain in
  their own Waiting lists, with unchanged counts**, and remain on Monitor.
- [ ] Call W2-B, then select W2-A from On hold. The selected held ticket is called;
  W2-B moves to Finished. Windows 1 and 3 are unchanged.
- [ ] Press Next ticket in Window 1. W1-A moves to Finished and W1-B is called.
- [ ] Drop W3-A. W3-B remains waiting and is still callable. Other windows keep
  their current tickets and lists.
- [ ] Have two windows perform Hold/Next near the same time. No ticket changes
  windows or vanishes from another window's Waiting list.
- [ ] Refresh one service window and Monitor. Their displayed ticket numbers and
  counts still agree with the other open pages.
- [ ] Rapidly double-click an action: it produces one transition, without dropping
  an extra client or creating duplicate entries.

If other clients were already waiting, the next ticket follows the existing FIFO
order. Use a quiet test queue or track those existing tickets; do not reset it just
to make the six UAT tickets first.

## 4. Ticket intake validation

- [ ] Issue one normal ticket for each of the five service choices. It appears in
  the correct window and on Monitor.
- [ ] Confirm the form contains service choices and the Get ticket button.
- [ ] Submit without selecting a service. No ticket is issued.
- [ ] Open Service Summary and verify that each ticket increases the total for
  its selected service by one. Calling or recalling the ticket leaves this count unchanged.

## 5. Public monitor and announcements

- [ ] Open the public monitor and confirm it shows **Live queue** and all three windows.
- [ ] Call a ticket from each window. Check that the correct ticket appears and the voice reads its number and window. With autoplay allowed, this works without clicking the page.
- [ ] On a browser that blocks autoplay, click anywhere on the monitor once. Call or recall a ticket and confirm it is audible through the monitor's speakers.
- [ ] Recall a ticket and verify it is announced again. Update a different window and check that unchanged tickets are not repeated.
- [ ] As a signed-in operator, verify that Registration Desk, the three service
  windows, Service Summary, and Queue Reports still open. A former Video
  Playlist bookmark (`/secret-management.html`) should open the workstation
  chooser (`/workstations.html`).

## 6. Authentication and navigation regression

- [ ] Sign in with one account in Browser A, then sign in with the same account
  in Browser B. Browser A shows the session-replaced notice when it next checks
  the session or attempts an action. It cannot keep making authorized changes.
- [ ] Remember that the one-active-login rule applies across Permit and Queue too.
- [ ] Sign out and try reopening protected permit and report URLs.
  Staff data/actions require signing in; the public monitor remains available.
- [ ] Open `http://localhost:3000/register`. It redirects to the login page.
- [ ] Check Back to portal from both systems. Local navigation stays on localhost.

## 7. Reports and exports after the test flows

- [ ] Open Queue reports for today's Manila date. Filter by each window and service.
  The UAT tickets contribute once to the totals for the correct window and service.
- [ ] Check Finished/Dropped counts against the UAT actions you recorded. Held time
  is excluded from service time. Older records without measured timing show unavailable
  timing rather than invented zero-duration service.
- [ ] Export a permit report to CSV and Excel. Open it: quoted titles, Unicode,
  filing dates, and worksheet formatting are preserved.

## 8. PostgreSQL backup shortcut check

The shortcuts cover both current PostgreSQL databases and any existing local
queue video files referenced by historical records.

- [ ] List existing PostgreSQL backups:

```powershell
npm.cmd --prefix "backend/monitorBP backend" run backup:list
```

- [ ] If performing a fresh recovery drill, stop both servers first, then run:

```powershell
npm.cmd --prefix "backend/monitorBP backend" run backup:create
```

It creates a backup and verifies restoration into disposable databases. It does
not replace the application databases. Expect a backup ID and successful verification.
The November 19, 2026 UAT verified restoration from an existing archive. Run this
fresh backup and restore drill to verify backup creation on the office host.
[PostgreSQL backup and recovery](POSTGRES-BACKUP-RECOVERY.md)

## Automated verification

The [November 19, 2026 local acceptance results](FULL-LOCAL-UAT-2026-11-19.md)
record counts and coverage for that release, including the former Video Playlist
workflow.

Record any failure with the page, account role, ticket/permit ID, action, expected
result, actual result, and screenshot. Only submit deletion/cleanup for the UAT
records you created; do not use Delete all records for this checklist.
