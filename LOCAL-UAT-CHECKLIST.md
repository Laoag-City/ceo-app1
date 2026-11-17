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
  W1-A/W1-B: Releasing Bldg. Permit; W2-A/W2-B: Releasing Bldg. Occupancy;
  W3-A/W3-B: Receiving Bldg. Permit (or another Window 3 service).
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
- [ ] Try a 51-character phone value. The request is rejected with a clear length
  message, no new ticket is issued, and the form remains usable.
- [ ] Enter a valid phone value and submit again. One ticket is created.
- [ ] Include an agent on one valid submission. Applicant/agent details still save.

The limit applies to the stored combined phone text, including an agent's phone.
Unsupported service values and malformed API payloads were verified automatically;
there is no need to modify the service options or send custom API requests.

## 5. Public monitor and announcements

- [ ] Open the public monitor and confirm it shows **Live queue** and all three windows.
- [ ] Call a ticket from each window. Check that the correct ticket appears and the voice reads its number and window. With autoplay allowed, this works without clicking the page.
- [ ] On a browser that blocks autoplay, click anywhere on the monitor once. Call or recall a ticket and confirm it is audible through the monitor's speakers.
- [ ] Recall a ticket and verify it is announced again. Update a different window and check that unchanged tickets are not repeated.
- [ ] For the separate staff Video Playlist page, verify upload, preview, reorder, and enable or disable with synthetic clips. The public monitor displays ticket information and announcements.

## 6. Authentication and navigation regression

- [ ] Sign in with one account in Browser A, then sign in with the same account
  in Browser B. Browser A shows the session-replaced notice when it next checks
  the session or attempts an action. It cannot keep making authorized changes.
- [ ] Remember that the one-active-login rule applies across Permit and Queue too.
- [ ] Sign out and try reopening protected permit, report, and playlist URLs.
  Staff data/actions require signing in; the public monitor remains available.
- [ ] Open `http://localhost:3000/register`. It redirects to the login page.
- [ ] Check Back to portal from both systems. Local navigation stays on localhost.

## 7. Reports and exports after the test flows

- [ ] Open Queue reports for today's Manila date. Filter by each window and service.
  The UAT clients appear in the correct cohort, without duplicate registrations.
- [ ] Check Finished/Dropped counts against the UAT actions you recorded. Held time
  is excluded from service time. Older records without measured timing show unavailable
  timing rather than invented zero-duration service.
- [ ] Export a permit report to CSV and Excel. Open it: quoted titles, Unicode,
  filing dates, and worksheet formatting are preserved.

## 8. PostgreSQL backup shortcut check

The shortcuts now target both current PostgreSQL databases and local queue video
files. Historical MySQL backups and their utility were retained.

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
For details and verification of an existing ID, see `POSTGRES-BACKUP-RECOVERY.md`.
This new backup/restore drill was **not run** as part of the code fixes.

## Automated verification already completed

- 230 frontend checks passed, including quoted-title deletion, failed clips,
  all-failed recovery, stall timeout, forms, routing, and session notices.
- 71 Permit PostgreSQL checks passed, including invalid metadata, approval-time
  revalidation, valid quote/lot edits, permissions, atomic creation, and history.
- 8 Queue PostgreSQL checks passed, including cross-window Hold isolation,
  Finish/Next, specific held-ticket selection, report timing, and reset preservation.
- Backend authentication, API, queue ordering/validation, media, SQL-adapter,
  retry-safety, and Excel/CSV regression suites passed.
- npm reported zero vulnerabilities in the updated Permit, Queue, and frontend
  dependency trees. Express remains on version 4; ExcelJS remains on version 4.
- Updated frontend sources/assets/builds match their published local copies.

Record any failure with the page, account role, ticket/permit ID, action, expected
result, actual result, and screenshot. Only submit deletion/cleanup for the UAT
records you created; do not use Delete all records for this checklist.
