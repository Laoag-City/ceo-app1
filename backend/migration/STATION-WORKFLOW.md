Building and Occupancy station workflow
=====================================

The IT superadmin uses the Stations checkbox menu in User Management to assign any number of stations to an operator. Several operators may share a station. Save stations commits the full selection together; Cancel discards it. Assignments apply across Building, Occupancy, and building sub-permits. Matching ignores case, punctuation, and the difference between “&” and “and”; distinct discipline names remain separate. An unassigned, inactive, or unverified operator cannot edit station details. Changing a role removes its station assignments and ends its sessions. Deactivating an account keeps the assignments until IT clears them.

Operators edit only assigned stations' Status, Date Checked, Date Approved, and Remarks. A station has one shared set of values. Assigned Engineer is read-only: each real station change records the authenticated operator's ID and authoritative name, and the display follows that reviewer's current profile name, falling back to their username. Unchanged saves and unchanged rows in a mixed batch keep the previous reviewer. Reassignment does not replace a recorded reviewer. Profile changes do not rewrite past approval or rejection names or change the project's review state. Manual engineer and reviewer ID overrides cannot set the recorded author. Older rows have no inferred reviewer ID; their existing single-operator display remains until a real save records the reviewer.

Save Signature Updates submits one versioned, transactional batch. Authorized changes save directly; unchanged values produce no request or activity entry. Existing station edit requests remain stored as history but cannot apply through the retired approval path. Project metadata and deletion requests retain their existing admin review flow.

New Occupancy permits, including CSV imports, are created with nine Pending stations: Line & Grade, Architectural, Civil / Structural, Electrical, Mechanical, Sanitary, Plumbing, Electronics, and Fire Safety.

New Building permits, including CSV imports, start with Office of the Building Official, Land Use and Zoning, Architectural, Structural, Line and Grade, Sanitary, Electrical, Mechanical, and CINSP BFP City Fire Marshal. An optional sub-permit created with the project receives the same stations. The project, lots, sub-permit, and all routing rows commit in one transaction; a failure saves none of them.

Both station configuration panels are hidden in the operator workspace. Existing projects are not changed by loading them. The routing matrix offers Add standard stations only for existing empty flows; this versioned action preserves configured matrices and creates no individual approval request. Station aliases such as Line & Grade and Line and Grade count as the same station; new duplicate rows are rejected within each routing target.

Every configured station is required, including all building sub-permit stations. An empty main matrix or an unconfigured sub-permit is not ready for approval. Station approval makes a project ready for final review; it does not approve the project. The admin reviews all station details, approves the project, or returns it with correction remarks. A return remains pending until real project changes are saved. Final decisions and their snapshots are append-only; station or project changes after approval append an invalidation, and reverting values does not revive an earlier approval. Review submissions check the project and latest final-review version together.

Installation and restart
------------------------

1. Apply the PostgreSQL schema with `powershell -NoProfile -ExecutionPolicy Bypass -File backend/migration/Apply-PermitStationWorkflow.ps1`. It adds assignment and final-review tables and runtime grants, replaces the old one-station/one-operator limits with a unique account/station pair, and adds nullable reviewer IDs to both routing tables. Existing assignments, station values, accounts, approval history, and loaded versions are retained. Re-running the migration is safe. MySQL installations perform the same constraint and reviewer-column upgrade at startup.
2. Publish the frontend from `frontend/portal-react` with `npm.cmd run publish:system`.
3. Stop the existing permit server in its VS Code terminal with Ctrl+C, then run `npm.cmd start` in `backend/monitorBP backend`. Refresh pages with Ctrl+F5. The queue server is independent.
4. Sign in as IT superadmin and assign stations to existing operators before they start editing. Assignments are intentionally not inferred from usernames or historical engineer names.

Verification
------------

`Verify-SignatureUpdates.ps1` runs PostgreSQL permission, date persistence, no-op, final approval, return, and invalidation tests against connection-local temporary tables in `permit_system_test`. The same scenarios run against MySQL temporary tables through `editWorkflow.integration.test.js`. `concurrentEdits.test.cjs` verifies simultaneous station saves and final reviews in a uniquely named disposable database. Frontend tests cover read-only rows, sub-permits, mixed row indexes, unassigned users, review UI, and the IT workspace.
