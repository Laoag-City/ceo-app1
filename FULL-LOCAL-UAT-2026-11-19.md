# Local acceptance test results

**November 19, 2026 · Asia/Manila · Pass**

The current workspace completed **29 browser and API acceptance scenarios** and **701 automated test executions** with zero final failures. Both normal localhost services passed their health checks. The acceptance scenarios ran separate application instances with disposable PostgreSQL databases, synthetic accounts and permits, and temporary video clips. Their databases and media were removed after testing.

| Area | Result | What was verified |
| --- | --- | --- |
| Portal and navigation | Pass | The permit root opens the portal, the old registration URL redirects to sign-in, and protected pages redirect signed-out users. The public monitor opens directly. |
| Operator, Admin, and IT access | Pass | Pending users cannot sign in. IT can approve accounts, assign multiple stations, and deactivate users. Admin can open both registries and the approval inbox. Station edits require a matching assignment. |
| Profile and sessions | Pass | Display-name changes persist. Account deactivation ends the session. Signing into Queue with the same account displaces the previous Permit session. Automated tests covered the idle timeout and replacement notice. |
| Building and Occupancy creation | Pass | Both types create their standard routing stations. Invalid fields are rejected without writing a project. Duplicate warnings and request retries preserve one saved record per accepted submission. |
| Processing time | Pass | Both forms show Simple, Complex, and Highly Technical. The red panel below Project ID shows the category, allowance, due date, and working days remaining. Tests covered the 3-, 7-, and 20-day calculations, weekends, Manila midnight, and overdue states. The countdown stops at final approval. |
| Added to system and permit contacts | Pass | The added date comes from the saved creation record and stays stable after edits. Phone and email accept blanks. Valid contact changes save immediately and survive a refresh. Editing contacts preserves existing final approval. |
| Routing and final review | Pass | Both types move through station rejection, correction, readiness, and final approval. Unauthorized and stale changes are rejected. The assigned engineer and review history show display names. |
| Requirements and inspections | Pass | Both checklists save and reject stale edits. Building procedure steps save with the document checklist. Both types can add and edit an inspection. Inspection deletion requires approval and preserves the parent permit. |
| Remarks and history | Pass | A repeated submission creates one remark. The record shows the author’s display name. Authors can remove their own remarks. Retrying a deleted remark leaves it removed. |
| Permit deletion | Pass | Operator requests retain the permit until review. Declining keeps it. The bulk approval requires **DELETE ALL**. Direct Admin deletion requires **DELETE** and removes the confirmed record. |
| Registries, reports, and print views | Pass | Registry filtering and permit aging passed automated checks. The monthly report counted the correct filed and approved records. CSV import, import retry, CSV and Excel export, a title containing quotes and a comma, and both print summary pages were verified. |
| Registration Desk | Pass | All five service choices are present. A ticket needs only the requested service. Retries create one ticket. No applicant fields appear in the form. |
| Service windows | Pass | Receiving and inquiries go to Window 1, Occupancy releasing goes to Window 2, and Building releasing goes to Window 3. Parallel calls, Next, Hold, Resume, Recall, Drop, Complete, and reconnect passed. Holding a ticket in one window leaves the other windows’ waiting tickets intact. |
| Public monitor and announcements | Pass in browser | Live state shows the correct ticket and window without personal details or a video panel. An instrumented Chrome run confirmed the text sent to the speech engine on call and recall. Automated tests covered chime logic, autoplay fallback, and repeat prevention. |
| Queue summary, reports, and audit | Pass | Service totals include all five categories with date filtering and exclude personal details. Queue reset preserves historical counts. Queue report timing and status counts passed, and audit access follows staff roles. |
| Video Playlist | Pass locally | An operator uploaded two synthetic WebM clips, reordered them, disabled and enabled a clip, and deleted both. Chrome decoded a stored clip. Uploads were removed on cleanup. |
| Database recovery | Pass | An existing PostgreSQL archive restored into temporary databases. Permit and Queue record checksums, schema, foreign keys, identity sequences, and one archived media file passed verification. Temporary recovery databases were removed. |
| Published local files | Pass | The 17 page shells, 77 shared assets, both bundles, and workstation shell match the current build outputs and sources. Ports 3000 and 5000 responded, and both sign-in pages and the public monitor loaded. |

## Automated counts

| Suite | Passed | Failed |
| --- | ---: | ---: |
| Frontend | 337 | 0 |
| Backend regression | 189 | 0 |
| PostgreSQL permit workflows | 91 | 0 |
| PostgreSQL account sessions | 11 | 0 |
| PostgreSQL inspections and checklists | 22 | 0 |
| PostgreSQL monthly reports | 5 | 0 |
| PostgreSQL permit aging | 1 | 0 |
| PostgreSQL duplicate handling | 12 | 0 |
| PostgreSQL bulk deletion | 23 | 0 |
| PostgreSQL queue and reports | 10 | 0 |
| **Total** | **701** | **0** |

The backend regression run skipped one PostgreSQL-only queue report test. That test passed in the dedicated PostgreSQL queue suite and is counted there.

## Fresh setup verification

The handoff checkout installed all four sets of locked runtime dependencies.
Both apps started with restricted database roles after applying the documented
SQL to empty PostgreSQL databases. The first Superadmin bootstrap and the
29 acceptance scenarios passed, for 32 successful checks in that run.
The empty-install databases were removed afterward.

## Findings and limits

- The first acceptance runs sent deletion requests without the UI’s confirmation values. The server returned the expected validation errors and retained the records. The corrected tests verified both rejection without confirmation and successful confirmed deletion.
- The handoff update corrected the [local acceptance checklist](LOCAL-UAT-CHECKLIST.md) to use service-only intake and the current window assignments.
- The deadline uses weekdays in Manila and currently counts weekday holidays. Older records and imports without a classification display **Processing time not set**.
- The physical monitor’s speaker output, printed paper output, and hosted services remain outside this local run. Chrome verified the announcement request and printable page rendering. The recovery drill verified an existing archive.

The frontend regression source is in [system tests](frontend/portal-react/system/tests).
Backend test files sit alongside the application modules and [database tests](backend/database).
The [IT handoff guide](docs/it-handoff.md) describes how to repeat the host acceptance checks.
