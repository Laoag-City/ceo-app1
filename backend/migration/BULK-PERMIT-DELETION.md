# Delete all permit records

Both operator registries offer **Delete all permit records**. It covers the entire
current registry, independently of search, filters, or pagination. The operator
types `DELETE ALL` and sends one request; no permit is removed on submission.

The admin sees the requester, count, and complete list in the corresponding permit
request section. Declining retains every record. Approving requires a separate
`DELETE ALL` confirmation and deletes the recorded projects and their cascading
details in one transaction. The other registry and user accounts are unaffected.

The request snapshots its projects, stations, sub-permits/lots or inspections and
checklists, prior requests, and final reviews. Changed or missing projects make the
request conflict; nothing is deleted and the operator can submit a fresh request.
New projects created after submission are excluded from the recorded scope.

Requests, decisions, and archives use the existing `project_records` table without
a cascading project foreign key. Final-review and activity history remain available
in admin history after deletion. Only one pending bulk request per registry is
allowed; session identity, roles, origin checks, and transaction locks enforce the
workflow on the backend.

No new database schema is required. Publish with `npm.cmd run publish:system` from
`frontend/portal-react`, restart the permit backend, and refresh with Ctrl+F5.
`backend/migration/Verify-PermitBulkDeletion.ps1` verifies both workflows against
temporary fixtures in `permit_system_test`, including cascade and rollback checks.
