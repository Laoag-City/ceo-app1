# Local security fixes: acceptance checks

Restart both existing VS Code server terminals with Ctrl+C, then run these from
the project root in separate terminals:

```powershell
npm.cmd --prefix "backend/monitorBP backend" start
```

```powershell
npm.cmd --prefix "backend/queue backend" start
```

Reload the local pages with Ctrl+F5. Use `http://localhost:3000/login` for Permit
and `http://localhost:5000/log-in.html` for Queue. All checks below are local.

## What to test

1. **Normal access:** Sign in with existing operator, admin and superadmin
   accounts. Check their usual workspaces, navigation and logout.
2. **Failed login:** Try a wrong password for an approved account, a pending
   account if available, and a nonexistent username. All should show the same
   failed-login response. A pending account with its correct password should
   still show approval is required and receive no access.
3. **Safe audit text:** Register a test visitor named
   `Security UAT <b>literal</b>`. In Queue's admin activity logs, the entire name
   must appear literally, including `<b>` and `</b>`, without bold formatting.
   Also check a name containing an apostrophe and quotation marks.
4. **Audit controls:** Search for `Security UAT`, change filters, use Refresh,
   and enable auto-refresh. Rows and action badges should remain readable;
   refreshes should not duplicate the rendered rows.
5. **Sessions:** Sign into the same account in another browser session. The
   first should receive the existing session-replacement notice. A wrong
   password should not terminate a valid session in another browser.
6. **Queue and monitor:** With different accounts, test Next, Hold, resume a
   held ticket and Drop across the three windows. Holding Window 2 must leave
   Window 1 and 3 waiting tickets unchanged. Keep the monitor open and check
   that updates and the video continue working.
7. **Permit and media regression:** Open both permit types, remarks and print
   summaries. Test reports, CSV/Excel downloads, and operator video upload,
   preview, reorder and enable/disable.

Optional header check: in DevTools > Network, select a page request. Its response
should include `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`,
`Content-Security-Policy` and `Content-Security-Policy-Report-Only`. Inline CSP
report-only warnings do not block the UI. The strict resource policy is still
being evaluated; it is not advertised as fully enforced.

Automated checks passed: 232 frontend tests; focused security/authorization and
video regressions; isolated PostgreSQL session replacement, queue transitions,
window isolation and report checks; and real startup, login pages, headers,
script MIME types, protected APIs and playlist checks on temporary local ports.

## Reverting only this patch

A private checkpoint preserves the source and published local files as they
were before these fixes, including earlier uncommitted work. It is under
`.deployment/local-security-2026-10-12T01-09-19-282Z`.

Preview the rollback from the project root:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File ".deployment/Restore-Local-Security.ps1" -WhatIf
```

If you decide to revert, stop both servers, then run the same command without
`-WhatIf`, restart them and reload the pages. The rollback checks file hashes
first and refuses to overwrite later edits. It restores only this patch's files;
it does not reset Git or restore/erase database records.
