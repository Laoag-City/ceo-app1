# Building inspection acceptance checks

Local implementation, October 12, 2026. No pilot deployment was changed.
The additive local PostgreSQL migration has already been applied. Existing
Building and Occupancy records were retained.

## Start testing

Stop the Permit server in its terminal with Ctrl+C, then restart from the project root:

```powershell
npm.cmd --prefix "backend/monitorBP backend" start
```

Hard-refresh the browser with Ctrl+F5. Sign in as an operator, open a Building
permit, and click **Inspections** beside **Routing Matrix** to open Inspection Monitoring.
The tab badges show the total routing stations (including sub-permits) and saved
inspections. Switching tabs keeps unsaved routing inputs in place.
The Queue server does not need restarting for this feature.

1. **Log and reload:** Click **Log inspection**. Choose Preliminary, enter the
   inspection date, inspector name, Scheduled result, findings and an optional
   next inspection date. Save once, then refresh the page. Exactly one card
   should remain, with the correct dates, findings, summary count, Edit and Delete.
2. **Edit and print:** Edit the card to Final / Passed, and enter several lines
   of findings. Save and refresh. The updated values should remain. **Print
   Summary** should include the saved inspection and the generator's display name.
3. **Validation:** Try a blank or spaces-only inspector/findings, and a next
   inspection date earlier than the inspection date. Saving must be blocked;
   existing records must remain unchanged. Correct the fields and save again.
4. **Deletion approval:** Cancel Delete first; nothing should change. Then
   request deletion as an operator. The card should remain until approval. Sign
   in with a separate admin account and check the Building request says **Delete
   inspection**, including the correct inspector and findings. Decline it first:
   the inspection remains. Submit again and approve: only that inspection should
   disappear; the Building permit and its routing must remain.
5. **Isolation and regression:** Another Building permit and all Occupancy
   inspections must remain unchanged. Log/edit an Occupancy inspection to check
   the shared form, existing inspection tab and count. Inspect both print summaries.
6. **Stale edits:** Open the same inspection in two tabs in one browser session.
   Save an edit in the first tab, then try saving the older edit in the second.
   The second save must be blocked, with its draft retained. Copy the draft before
   refreshing. Do not use two independent sessions on the same account: the
   existing session replacement rule will end the earlier session.

Inspection results record site visit outcomes. They do not automatically change
station routing statuses or final project approval.

## Implementation and verification

- `inspectionWorkflow.js` shares validation, parent locks, record versions and
  inspection-only deletion approvals between the two permit types.
- Building records use `permit_inspections.permit_id`; Occupancy continues using
  `occupancy_inspections.occupancy_id`. The new parent foreign key cascades only
  when its own Building permit is deleted.
- `inspectionRoutes.js` permits operator writes and authenticated reads. Admins
  review deletion requests through their existing Building approval queue.
- `PermitInspections.jsx` and `permit-inspections.js` / `.css` share the cards,
  modal, guarded submissions, error recovery and office calendar dates.
- The Building activity audit, print summary and bulk deletion snapshots now
  include Building inspections. Changes after a bulk deletion request block that
  stale approval; old requests with no inspections remain compatible.
- Fresh PostgreSQL schema generation and test database copies include the new table.
- Verified: 243 frontend checks, 15 real PostgreSQL inspection checks, 12 bulk
  deletion checks, local backend initialization and unauthenticated API rejection.
  Database tests used disposable fixtures; browser layout verification used sample
  records held in memory.

Repeat the database verification from the project root:

```powershell
& .\backend\migration\Verify-Inspections.ps1
& .\backend\migration\Verify-PermitBulkDeletion.ps1
```

## Future deployment

Before deploying this feature to any existing PostgreSQL host, run
`backend/migration/permit-inspections.sql` in the application's schema using the
database owner, and grant the application's role SELECT/INSERT/UPDATE/DELETE on
the table and USAGE/SELECT on its identity sequence. Do not recreate an existing
database. The local owner wrapper is `Apply-BuildingInspections.ps1`; it is
restricted to the local migration/test databases and does not target Neon.

Pre-feature source copies are under `.feature-backups/building-inspections-20261012`.
If reverting later, preserve any newly entered inspections; removing the feature's
code does not require dropping its table or deleting data.
