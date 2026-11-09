# Permit aging — local acceptance checks

Implemented locally in both Building and Occupancy registries. The deployed testing
sites are unchanged. This is a read-only projection: no migration, new table, or
rewrite of existing permit records is needed.

## What the indicators mean

- **Age:** calendar days since Date Filed / Date Applied.
- **Inactivity:** calendar days since the latest saved activity entry. Comments,
  failed/blocked requests, and unconfirmed writes do not reset this value.
- **Follow-up due:** 14 or more calendar days without recorded activity.
- **Overdue:** 30 or more calendar days without recorded activity.
- **Finally approved:** follow-up reminders stop while final approval remains valid.
- **Check dates:** missing, invalid, or future dates are not assigned a negative age
  or a misleading overdue flag.
- **No activity log; using filing date:** an older record has no saved activity
  history, so inactivity uses the filing date. This is an estimate, not a claim
  that nothing happened before activity logging was introduced.

The 14/30-day defaults are local trial reminders, not statutory deadlines. IT can
configure whole numbers from 1–3650 through `PERMIT_AGING_FOLLOWUP_DAYS` and
`PERMIT_AGING_OVERDUE_DAYS`; overdue must be greater than follow-up. Restart the
permit server after changing those settings. Calculations use Asia/Manila dates;
the explanation below the filters states the snapshot date. Refresh to recalculate.

## Test on your normal localhost

1. Stop the current permit server with Ctrl+C, then start it from the project root:

   ```powershell
   npm.cmd --prefix "backend/monitorBP backend" start
   ```

2. Open http://localhost:3000, press Ctrl+F5, and sign in as an operator or admin.
   Both registries should show an Aging column, a Follow-up filter, and the
   Longest without activity sort option.
3. Select Needs follow-up: only Follow-up due and Overdue records should remain.
   Overdue only should exclude Follow-up due and finally approved records.
4. Combine the new filter with a name search, status filter, and filing-date range.
   Pagination and filtered export selection should continue to follow that view.
5. Refresh: the selected filter should be retained for your account and registry.
   Clear filters should restore All aging indicators and Newest project ID.
6. Save a genuine change to your assigned station on a test permit, return to the
   registry, and refresh. Inactivity should become 0 days; filing age stays intact.
   A comment or failed save should not reset inactivity.

A newly entered application with an old filing date has activity today, so it can
have a high filing age while remaining Within threshold. You do not need to wait
14 days or alter real records to check the thresholds; use the fixture below.

## Instant, disposable scenarios

An ignored local test launcher is available in this workspace:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File ".deployment/Start-PermitAgingBrowserUat.ps1"
```

Open the printed `UAT_URL` on its separate loopback port. It creates an empty,
private schema in local `permit_system_test`, runs the real permit backend, and
seeds these six examples in each registry:

| Example | Expected result |
| --- | --- |
| Recent activity | 64 days since filing; 2 inactive days; Within threshold |
| Follow-up due | 64 days since filing; exactly 14 inactive days; yellow badge |
| Overdue | 64 days since filing; exactly 30 inactive days; red badge |
| Historical record | 45 days old; no saved log; explicit filing-date fallback |
| Finally approved | 64 days old; no overdue reminder |
| Future date | Check dates; no negative age |

Disposable accounts: `uat_operator` or `uat_admin`; password `UatOnly2026!test`.
These exist only inside that temporary test schema. The operator is assigned to
Architectural for testing genuine station updates. Saving a station update on one
registry must not reset inactivity in the other registry.

When finished, type `quit` in the fixture terminal or press Ctrl+C. The temporary
server stops and its schema is removed. Your normal localhost records are untouched.

## Verification completed

- 292 frontend regression checks passed.
- 7 backend calendar/threshold/behavior checks passed.
- 1 restricted-role PostgreSQL integration check passed, proving that failed
  activity, comments, and the other registry cannot reset the clock and that the
  projection does not modify stored data.
- Real browser checks passed for thresholds, filters, sorting, persistence,
  finally approved exclusions, future dates, and a real station update resetting
  Building inactivity while Occupancy remained overdue.

Source changes are confined to the aging projection, registry responses, shared
registry controls/display, their focused regression fixtures, and published local
frontend copies. Existing approval rules, station assignments, deletion permissions,
and export formats are preserved.
