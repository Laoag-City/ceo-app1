# Approval inbox — localhost

Sign in as an engineering admin and open **Approval Inbox** in the sidebar, or
visit http://localhost:3000/approval-inbox. The admin overview also links to it.
Operators and IT superadmins do not receive inbox access.

## What it includes

- Pending Building permit edits supported by the existing approval workflow.
- Building and Occupancy permit deletion requests, including Delete All.
- Inspection-only deletion requests from either registry.
- Building and Occupancy projects currently ready for final approval.

The page combines the existing pending-request and final-review APIs. It does
not introduce tables, migrations, duplicate request records or new approval
permissions. The previous admin review panels remain available.

Submitted requests show the requester's current display name and their recorded
submission time in Manila. They appear oldest first. Automatic final reviews
follow: these have no separate requester or submission date. Only projects
currently ready for final review are included in the pending inbox. Earlier
approvals and returned projects remain accessible through Final Project Review.

## What to test

1. As an operator, submit a Building permit edit, a permit deletion and an
   inspection deletion. The affected records must remain until approved.
2. As an admin, open the inbox. Verify counts, display names, references and
   green Building / yellow Occupancy badges. Filter by request type and registry.
3. Open an edit and compare the submitted Before/Proposed values. Cancel the
   confirmation: nothing should save. Confirm approval: the edit should apply
   once and the entry should leave the inbox. A malformed or unsupported older
   request must have approval disabled while still allowing it to be declined.
4. Decline a permit deletion and check that the permit remains. Approve an
   inspection deletion and check that only the inspection is removed.
5. Submit Delete All as an operator. Review its recorded scope as admin. Approval
   must remain disabled until the exact text `DELETE ALL` is entered. Cancel
   retains everything. Confirming deletes only the recorded scope; newer permits
   outside it remain.
6. Complete every required routing station, including sub-permit stations. Open
   the final-review entry. Review station details in the existing read-only
   dialog, then confirm final approval or return with correction remarks. The
   entry leaves the pending inbox when it is no longer ready for final approval.
7. With the same request open in two admin sessions, process it once. The other
   session must show an error or remove the entry after refreshing, without
   automatically replaying its action. Failed/unconfirmed writes require checking
   saved state before retrying through the existing recovery controls.
8. Try direct inbox URLs as an operator, IT superadmin and signed-out visitor.
   Expect redirects to the appropriate workspace or login. Existing approval APIs
   must continue enforcing the engineering-admin boundary.
9. Check a request's inspection date against the logged inspection. Saved ISO
   dates at Manila midnight must not display the previous UTC day. Check the
   mobile drawer and desktop sidebar for horizontal overflow.

## Verification

The installed build passed 316 frontend checks, 25 backend report/audit/page
checks and 88 PostgreSQL workflow checks. Separate real-server checks used an
isolated local test schema and real cookie authentication to verify submissions,
review decisions, deletion scope, final approval and retained history. The browser
check covered filters, deletion confirmation and the installed layout.

No deployed testing service was updated. Existing localhost permit data was not
used for destructive verification.
