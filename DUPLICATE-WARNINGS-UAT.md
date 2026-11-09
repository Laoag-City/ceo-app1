# Duplicate warnings — local acceptance checks

This change is local only. No testing-site deployment is included. The additive
local migration creates `permit_creation_requests` for safe creation retries;
existing permits, lots, routing stations and approval decisions are retained.

## Start the updated permit backend

Stop the current permit server with Ctrl+C in its terminal. From the project root:

```powershell
npm.cmd --prefix "backend/monitorBP backend" start
```

Open http://localhost:3000 and press Ctrl+F5. Sign in as an operator.
The queue server does not need a restart for this feature.

## 1. Create a normal building permit

Use a fresh test identity, for example:

- Project: `UAT Duplicate Check 01`
- Owner: `UAT Owner 01`
- Location: `UAT Address 01`
- Designer: `UAT Designer 01`
- Lot: `00124`
- Filing date: today's date

Expected: one new permit with the usual lots and standard stations. If those test
details already exist, use a fresh suffix for the first record.

## 2. Warning and cancellation

Try creating another building permit with the same details. Change the title's
capitalization or add extra spaces to confirm these do not hide a likely match.

Expected: a “Possible duplicate permits” dialog showing the existing reference,
project, owner, location and reasons. “Save anyway” stays disabled until checked.
No new permit should exist yet. “Open existing permit” opens a separate tab.
Choose “Return to form” or press Escape: entries remain and the count stays the same.

## 3. Deliberate separate application

Submit the same draft again, review the matches, check the acknowledgement and
choose “Save anyway” once.

Expected: exactly one additional permit, with a different ID. Its activity records
include acknowledgement of the possible duplicates using the actor's display name.
No existing project is merged or changed.

## 4. Different match signals

- Different title, same owner and location: warning.
- Same lot and owner, different title/location: warning.
- Same lot alone, with different title, owner and location: no warning solely for the lot.
- Lot `00124` and lot `124` are distinct; leading zeroes are preserved.

Use distinct titles for the last case to avoid a separate title match.

## 5. Occupancy reference and registry separation

Create an occupancy test application with reference `UAT-BP-001` and unique details.
Try another occupancy application with that reference, a different project title,
owner and address. Expected: a reference-match warning. Return to the form and
verify the count did not change; acknowledge deliberately to test saving.

A building record and an occupancy record sharing details are not considered
duplicates across registries. Occupancy referencing a building permit remains valid.

## 6. Simultaneous users and repeated clicks

Use two different operator accounts in separate browser sessions. Have both prepare
the same fresh test details before either saves. Submit both.

Expected: one saves first; the other receives a warning instead of silently adding
another record. The second can cancel or deliberately acknowledge a separate application.
Rapid repeated clicks on one form should create one record. Automated database tests
also cover lost-response retries using the same submission key and database rollback.

## 7. Imports, edits and permissions

As admin, preview a CSV containing an existing project or occupancy BP reference.
Expected: possible duplicates remain visible and require acknowledgement before import.

Existing Building metadata edits are checked for identity changes and again at
administrator approval. A new match after submission requires a fresh review;
the existing permit remains unchanged while a warning is awaiting acknowledgement.
Designer/date-only edits do not add an unnecessary duplicate warning.

Admins and superadmins still cannot create permits through operator-only creation.
Station assignments, inspection/checklist permissions, and normal approval workflows
remain in effect. Remove UAT records through the existing deletion workflow.

## Automated verification completed

- Frontend: 287 checks.
- Duplicate creation/retry/approval/import PostgreSQL fixture: 12 checks.
- Station, approval, profile-name and history PostgreSQL regressions: 88 checks.
- Import/export and audit regressions: 19 checks.

Database tests use disposable schemas/tables. The real local database receives only
the additive retry-bookkeeping migration, not the test fixture applications.
