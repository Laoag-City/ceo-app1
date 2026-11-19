# HTTP security configuration

Both servers use `backend/http-security.js`. These changes were applied to the
local checkout only. Render, Neon, the deployed repository and database roles
were not changed.

## Direct localhost access

`OFFICE_TRUST_PROXY` is unset by default. Express uses the actual connection
address and ignores caller-supplied forwarding headers. No environment change
is required for the existing `npm.cmd start` launchers.

## IT reverse-proxy configuration

IT should first establish which gateway IPs/CIDRs connect to the application and
ensure that gateway controls its forwarding headers. Set `OFFICE_TRUST_PROXY`
to an explicit comma-separated allowlist of those IPs/CIDRs on both services.
`false` disables proxy trust. Boolean unrestricted trust, numeric hop counts,
hostnames, empty entries and `/0` networks are rejected.

Example for a gateway listening on the same machine only:

```text
OFFICE_TRUST_PROXY=127.0.0.1/32,::1/128
```

This is an example, not a setting to apply automatically. Use the actual IT
gateway addresses. The login limiter uses Express's validated client address;
invalid forwarded addresses fall back to the socket peer. Existing per-account
and per-address cooldowns remain. These counters are held in each server's
memory; multiple instances would require a shared limiter store.

## Enforced browser protections

- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `X-Frame-Options: SAMEORIGIN`
- CSP: `frame-ancestors 'self'; object-src 'none'; base-uri 'self'`
- Express's identifying `X-Powered-By` header is disabled.

These protections leave current inline scripts, event handlers, styles, live
queue connections and download workflows usable. Preview mode
retains its extra network restrictions together with the framing policy.

## CSP resource policy: staged rollout

`Content-Security-Policy-Report-Only` contains a stricter resource policy for the
current application, fonts/icons and local/configured service
connections. It reports violations in the browser console without blocking
resources. No external reporting endpoint is configured.

Inline script/style warnings are expected at this stage. Before enforcing this
resource policy, review the violations, migrate required inline handlers/scripts
or authorize them safely, and verify every page, exports, printing, sockets and
video previews. Strict script CSP enforcement remains future work.

## Login and audit behavior

Wrong passwords receive the same failed-login response for unknown, approved,
pending and inactive usernames. Unknown or invalid stored hashes cannot create a
session. A pending/inactive account's status is shown only after a correct
password check; these accounts still cannot sign in.

Queue audit rows display visitor names, details, filenames, station names and
action labels as text. Badge classes come from a fixed allowlist. Existing
stored records do not need to be deleted or rewritten for safe display.

## Remaining production work for IT

Configure HTTPS, secure cookies, proxy trust and restricted runtime database
roles for the actual production host. The current pilot's owner credentials
were not changed. Public ticket-creation abuse limits/kiosk authorization are
also separate from this patch and remain to be addressed.
