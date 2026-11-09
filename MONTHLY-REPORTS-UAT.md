# Monthly permit reports — localhost

Open http://localhost:3000/monthly-reports and sign in as an engineering admin, or
choose **Monthly Reports** in the admin sidebar. Operators and IT superadmins do
not receive this page or API access. Existing registry exports remain available
through their previous workflows.

The local permit server has been restarted with the installed feature. Press
Ctrl+F5 if the sidebar or bundle was cached. The deployed testing sites were not
updated. No schema migration or rewrite of existing permit records was required.

## Report rules

- **Applications filed:** parent Building/Occupancy applications whose current
  filing date is in the selected month. Sub-permits are not separate applications.
- **Final approvals:** distinct parent permits with a recorded final approval in
  the month. A later invalidation does not erase the fact that an approval occurred.
- **Returned for correction:** distinct permits with a recorded final return or
  station rejection during the month. Failed attempts, comments, pending edit
  submissions and unconfirmed writes do not count.
- A permit can appear in both the returned and approved metrics in one month.
  Several decisions/stations do not multiply the count for that parent permit.
- **Average processing time:** calendar days from the filing date saved in the
  approval snapshot to the last final approval for that permit in the month.
  Incomplete applications and approvals with unusable/inconsistent saved dates
  are excluded from the average; the exclusion count is displayed.
- Approvals/returns can concern applications filed in an earlier month. Detail
  rows therefore need not total the number filed in the month.
- The current month stops at today's Manila calendar date. Future months are
  rejected. Empty reports show zero counts and an unavailable average.

## What to test

1. Open the admin sidebar link. Check that the previous full month loads by
   default and that the figures reflect real local records, not the preview's
   sample numbers.
2. Change the month and choose Building, Occupancy, then both. Check that the
   reporting-period label, totals, breakdown and weekly chart all change together.
3. Open **Detailed records**. Check the references, MM/DD/YYYY dates, activity
   dates and processing days against a few known applications. Use Next/Previous
   if there are more than 20 matching records.
4. Download **Export Excel**. Expect Summary, Building and Occupancy worksheets.
   Dates should be native date cells displayed as MM/DD/YYYY. Type filters apply
   to the exported records, while pagination does not limit the export.
5. Download **CSV**. Check the selected month/type, date format and all matching
   records. Project titles containing commas, quotes or apostrophes must remain
   in their correct columns. Formula-like titles are exported safely as text.
6. Open **Print summary**, then **Print / Save PDF**. The printed page should
   contain the office heading, period, permit breakdown and signature lines,
   without navigation or export controls.
7. Try an empty earlier month and a future month. Expect a valid zero report for
   the empty month and a validation error for the future month.
8. Sign in as an operator or IT superadmin and try the direct URL. It should
   return to that role's workspace; the reporting API must reject the request.

## Deletion/history handling

Retained final-review snapshots, completed bulk-deletion snapshots and direct
admin-deletion snapshots can supply deleted applications. Approved operator
deletions now retain filing metadata in their existing saved audit entry as well.
The deletion approval and permission rules themselves are unchanged. A failed or
unconfirmed deletion attempt is not treated as a successful reporting archive.

Older deletions without usable retained metadata cannot be reconstructed. Older
correction entries with unreadable dates are excluded and flagged. Filing-date
edits can move an existing application between filing months; processing time
continues to use the saved approval baseline. Large source sets are rejected
with an explicit safe-row-limit message rather than silently truncated.

## Verification completed

- 299 frontend checks, including a regression for native month-input events.
- 14 report calculation/export and project-audit checks.
- 5 PostgreSQL API/export checks using SELECT-only fixture grants.
- 88 existing station, approval, profile and history workflow checks.
- 10 protected-page/navigation checks.
- **416 automated checks passed.**
- Real cookie-login checks passed on an isolated full production server for
  anonymous/operator denial, admin access, four report scopes, actual Excel/CSV
  responses and empty periods.
- Browser checks passed for admin navigation, the fixed month picker, type
  filtering, detail dates, print summary and an actual CSV download. That CSV in
  Downloads contains disposable test records, not the user's database records.
- The existing localhost database report succeeded under its normal runtime
  account in an explicitly read-only transaction. Port 3000 health, portal,
  reporting-page protection and API authentication checks passed after restart.

Temporary test schemas and their server were removed. The normal local permit
server remains running. Evidence and logs are in `.deployment/monthly-reports-*`.

To start the server again later, the normal command from the project root is:

```powershell
npm.cmd --prefix "backend/monitorBP backend" start
```

If an npm subprocess reports that Microsoft.PowerShell.Security cannot load,
run the existing launcher directly from a PowerShell terminal:

```powershell
& ".\backend\migration\Start-Postgres.ps1" -Service permit
```
