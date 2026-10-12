# Security review — 12 October 2026

Local and pilot update: the audit-log text rendering, proxy-aware limiter configuration,
browser headers and password-before-status checks have now been fixed and tested
in the local checkout. Strict resource CSP is report-only during rollout. The
fixes were included in the 12 October pilot redeployment after local tests.
Explicit trusted proxy addresses still require the hosting team's configuration.
See [local acceptance checks](LOCAL-SECURITY-UAT.md)
and [security configuration](SECURITY-CONFIGURATION.md). The findings below
describe the pre-fix review; ticket-intake abuse limits and production database
permissions remain separate work.

Scope: current source, the deployed application's prepared source snapshot, four
npm package audits, local simulations, and read-only hosted HTTP checks. No
application fixes, database changes, hostile ticket submissions, live flooding,
or deployment changes were made during this review.

## High: stored cross-site scripting in Queue audit logs

The public ticket route accepts a visitor name as text and records the original
name in `audit_logs.details`. The audit controller inserts `log.details` and
`log.user_station` directly into `tbody.innerHTML`. The action label also uses
HTML interpolation without output encoding.

Sources:

- `backend/queue backend/queueServer.js:216` and `:220`
- `backend/queue backend/ticket-submission.js:11`
- `frontend/portal-react/system/features/queue/audit-logs.html:285`
- The same renderer is present in the prepared deployed Queue HTML.

A crafted visitor name can therefore become executable markup when an admin
opens or refreshes audit logs. Script running there could read Queue data and
perform actions permitted by that signed-in Queue session. HttpOnly cookies
prevent direct cookie reading but do not stop same-origin authenticated actions.

Verification: a local isolated renderer accepted harmless `<strong>` markup in a
validated ticket name and passed it unchanged to `innerHTML` in both source
copies. No script or record was injected into the live system.

Recommended fix: construct log rows with DOM nodes and assign all record fields
through `textContent`; preserve action badges through an explicit class allowlist.
Check log text originating from ticket actions and uploaded video names too.
Test markup-looking names as literal text in logs, filters, and refreshes.

## Medium: public ticket intake has no abuse limit

`POST /api/tickets` is intentionally available to public kiosks. It has input
validation, an origin/header check and duplicate-request handling, but no request
rate limit or kiosk authorization. A caller can submit many unique request IDs.
An origin check is not caller authentication: a non-browser client can set it.

Impact: fake tickets, inaccurate reports, growing logs, database load and repeated
monitor broadcasts. No flood was performed against the hosted service.

Recommended fix: rate-limit ticket creation and choose whether only office kiosks
should issue tickets. If kiosk access is required, use server-managed kiosk
authorization rather than a secret embedded in public JavaScript. Preserve
legitimate retry handling and the existing staff intake workflow.

## Proxy-dependent risk: login limiter can block unrelated users

`backend/monitorBP backend/authLimits.js:16` keys its limits on
`req.socket.remoteAddress`. Behind a reverse proxy this can identify the shared
proxy instead of the visitor. Its 100-attempt limit can then affect other staff,
and registration can share a 10-request bucket.

Verification: a local simulation with two distinct client IPs behind one socket
peer returned HTTP 429 for the second client after the first exhausted the bucket.
This confirms the limiter behavior; the exact distribution of Render proxy peers
was not tested by deliberately locking out live users.

Recommended fix: verify the platform's forwarding contract, then use a trusted
proxy configuration and validated client IP. Do not blindly trust arbitrary
`X-Forwarded-For` values. Keep account-specific limits, and use shared counters if
the service is later run with multiple instances.

## Browser hardening gap: security headers are absent

The hosted Queue login response had no Content-Security-Policy, X-Frame-Options,
X-Content-Type-Options or Referrer-Policy. This is a missing defense layer, not
proof of a separate authentication bypass or exploitable clickjacking chain.

Recommended fix: add framing, MIME and referrer policies; introduce CSP carefully
because current pages contain inline scripts and event handlers. CSP should
supplement output encoding, not replace the audit-log fix.

## Lower priority: pending account enumeration

`backend/monitorBP backend/authServer.js:83` reports that an account is pending
before checking its password. An unauthenticated caller can distinguish a pending
username from an unknown username. Consider a generic failed-login response and
show approval status only through a deliberate, protected workflow.

## Deployment hardening

The test services currently use the shared Neon database owner credential. This
was the deployment setup, not an observed credential leak. Separate runtime
database roles with only the required permissions would reduce the impact of a
future application compromise. Keep owner credentials for migration/restore work.

## Checks that passed

- npm audit reported zero known vulnerabilities for Database, Permit, Queue and
  the frontend, including installed development dependencies where present.
- Unsigned GET requests returned HTTP 401 for both permit registries, Queue
  client history, Queue reports, Queue logs and video management.
- Reviewed sessions use random tokens, stored hashes, HttpOnly cookies and
  server-side account/role checks; secure cookies are configured for hosting.
- PostgreSQL error handling suppresses confidential constraint details, and
  reviewed Permit CSV exports neutralize formula-leading values.

These checks do not establish that every route or hosting setting is free from
vulnerabilities. The audit-log issue is the first fix to prioritize.

References: [OWASP XSS prevention](https://cheatsheetseries.owasp.org/cheatsheets/Cross_Site_Scripting_Prevention_Cheat_Sheet.html),
[Express behind proxies](https://expressjs.com/en/guide/behind-proxies/).
