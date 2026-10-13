# Staff inactivity timeout

Implemented locally for Permit and Queue. Restart both servers, refresh with Ctrl+F5, and sign in again before testing.

```powershell
npm.cmd --prefix "backend/monitorBP backend" start
npm.cmd --prefix "backend/queue backend" start
```

Run each command in a separate terminal. Stop its previous server with Ctrl+C first.

## Expected behavior

- Staff sessions expire on the server after 30 minutes without activity. Input activity is reported at most once every 10 seconds, so visible timing can vary by several seconds.
- At approximately 28 minutes a warning offers **Stay signed in**. Use that button to continue; moving the mouse over the warning does not dismiss it.
- Background polling and queue updates do not renew sessions. The existing eight-hour maximum session duration still applies.
- Tabs sharing a session observe the same server deadline. A different browser signing into the same account still replaces the original session.
- The public portal and queue monitor are not subject to the staff timeout.
- No new database table or migration is required. Startup caps older sessions at 30 minutes without extending shorter deadlines.

## Manual checks

1. In each system, leave a signed-in staff page untouched for 28 minutes. Expect the warning and countdown. Click **Stay signed in** and confirm the warning closes and normal actions work.
2. Repeat, allowing the full 30 minutes to pass. Expect **Session ended**, then use **Go to sign in**. Refreshing the protected page must also require authentication.
3. Use two tabs in the same browser session. Continue working in one tab and confirm the other remains signed in. With no activity in either tab, both should expire.
4. Sign into the same account in a separate browser. The original session must still show the separate **signed in somewhere else** explanation.
5. Leave the public queue monitor open beyond 30 minutes. Videos and queue updates should continue.
6. While the warning is visible, disconnect the network and click **Stay signed in**. Expect a retry message, not a false success. Reconnect; renewal succeeds only if the server session has not already expired.

Automated verification: 263 frontend checks, 14 authentication/Queue checks, and 11 isolated PostgreSQL session checks passed. Warning appearance and its renewal button were checked in an isolated browser preview; no real records were changed for these tests.
