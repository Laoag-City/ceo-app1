# Permit contacts and service-only queue UAT

This update is local. Use separate staff accounts for simultaneous windows.
Existing records are retained. Refresh open tabs after both servers restart.

1. **Building and Occupancy creation:** Create a synthetic permit with phone and
   email, then view its Contact details. Repeat with both blank. Invalid email,
   invalid phone text, or values beyond 50 phone/255 email characters must be
   blocked without creating a record. Keep all other required fields valid.
2. **Contact correction:** As an operator, open the permit workspace and choose
   Edit contact details. Choose Save contact details. The correction should appear
   immediately and persist after refresh, without an approval request. Clear both
   fields and save again; blanks must be accepted. A final engineering approval
   must remain intact. Try another contact save without refreshing to confirm the
   saved version updates correctly. Admins have read access to this contact
   section; station permissions are unchanged. Labels contain no optional text.
3. **Exports/imports:** Export CSV and Excel from either registry and confirm the
   phone/email columns. Preview the new import template with blank or valid
   contacts, and an older template without the new columns. Both formats should
   work. Invalid supplied contact details should prevent importing that batch.
4. **Registration Desk:** Only the five requested services and Get ticket should
   remain. Select each service and issue a ticket. There must be no applicant,
   agent, phone, address, or building-location fields. Rapid repeat submission
   or retry of the same submission should produce one ticket.
5. **Window routing:** Receiving Building, Receiving Occupancy, and Inquiries go
   to Window 1; Occupancy releasing goes to Window 2; Building releasing goes to
   Window 3. Test Next, Hold, Resume, Recall, and Drop without affecting another
   window's tickets. Test an existing ticket too.
6. **Service Summary:** Open it from workstation selection. Today should show
   five service rows (including zero counts) and the total tickets issued. Change
   the From/To dates and refresh. Calling, recalling, holding, or completing a
   ticket must not increase the issued count. No personal details should appear.
7. **Reset:** On an isolated test database, use an admin account to reset the
   queue. The summary for the same dates must retain its counts. Issue a new
   ticket and confirm it adds exactly one even if a ticket number is reused.
8. **Errors and mobile:** Check invalid date ranges, signed-out access, a failed
   network request followed by Refresh, and a narrow mobile viewport. The count
   column should remain visible. Failed contact submissions retain the draft.

Automated verification uses disposable PostgreSQL databases and temporary
tables. It does not use the normal localhost records as test fixtures.

The bold **Added to system** date beside each permit-details heading is the
recorded registration date, shown in Manila time. It is separate from Date Filed
or Date Applied. Check a newly created record with an older filing date, then
edit and refresh it: the added date must stay the same. Hover over the date to
see its recorded time. Older records without reliable creation history show
Not recorded.
