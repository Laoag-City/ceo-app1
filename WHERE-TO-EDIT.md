# Where to edit

All authored frontend code now lives under `frontend/portal-react`.
The web addresses and backend folders have not changed.

## Pages

Within `frontend/portal-react/system/features/`, each page has:

- `.jsx`: page layout, labels, buttons and initial markup.
- `.html`: document shell, linked assets and existing controller scripts.

| Page | Source pair under `system/features/` |
|---|---|
| Permit sign-in | `auth/login.jsx` and `auth/login.html` |
| Building registry | `building/registry.jsx` and `building/registry.html` |
| Building Details | `building/details.jsx` and `building/details.html` |
| Occupancy registry | `occupancy/registry.jsx` and `occupancy/registry.html` |
| Occupancy Details | `occupancy/details.jsx` and `occupancy/details.html` |
| Admin / Superadmin dashboard | `administration/dashboard.jsx` and `administration/dashboard.html` |
| Queue sign-in | `queue/login.jsx` and `queue/login.html` |
| Queue service desk / clerk controls | `queue/service-desk.jsx` and `queue/service-desk.html` |
| Queue monitor | `queue/monitor.jsx` and `queue/monitor.html` |
| Queue audit logs | `queue/audit-logs.jsx` and `queue/audit-logs.html` |
| Queue service summary | `queue/client-history.jsx` and `queue/client-history.html` |
| Queue reports | `queue/reports.jsx` and `queue/reports.html` |
| Printable project summary | `printing/project-summary.html`, `.js`, and `.css` |

The old occupancy/admin sign-in layouts live in `auth/legacy-*.jsx/.html` for compatibility.
Their URLs still lead to the shared login. The retired permit-selection page is removed.

The landing portal is separate: edit `src/main.jsx` and `src/style.css`.

## Shared styles and behavior

| Change | Editable source under `system/` |
|---|---|
| Sidebar labels, links, collapse/menu behavior | `shared/PermitSidebar.jsx` |
| Sidebar and fixed header positioning | `assets/permits/permit-sidebar.css` |
| People directory, My Profile, presence heartbeat | `features/accounts/AccountTools.jsx` |
| People / My Profile layout and light/dark colors | `assets/permits/account-tools.css` |
| Permit registry base styles | `assets/permits/index.css` |
| Permit Details base styles | `assets/permits/edit.css` |
| Queue workspace overrides | `assets/queue/queue-workspace.css` |
| Queue service desk base styles | `assets/queue/kiosk-style.css` |
| Queue monitor base styles | `assets/queue/monitor-style.css` |
| Shared office header | `assets/common/shared-header.css` |
| Light/dark theme | `assets/common/appearance.css`; `assets/permits/appearance.js` and `assets/queue/appearance.js` |
| Remarks and Logs panels | `assets/permits/project-records.js` and `.css` |
| Permit role navigation | `assets/permits/permit-routing.js` |

Some page-specific CSS remains inside its `.html` shell. Search that file if a base
stylesheet change is being overridden. The organization does not rewrite controllers.

## Save → publish → refresh

Run the publish commands from `frontend/portal-react`, which contains
`package.json`, or use the repository-root commands below.

| What you edited | Command from `frontend/portal-react` |
|---|---|
| Landing portal under `src/` | `npm.cmd run publish:local` |
| Building, Occupancy, admin, Queue, sidebar, or shared assets under `system/` | `npm.cmd run publish:system` |

From the repository root, publish **any system page, shared component, CSS, or browser helper**:

```powershell
npm.cmd --prefix "frontend/portal-react" run publish:system
```

For **the landing portal**:

```powershell
npm.cmd --prefix "frontend/portal-react" run publish:local
```

Use `npm.cmd` to avoid PowerShell's blocked `npm.ps1` shortcut. Refresh afterward;
use Ctrl+F5 if cached assets remain. Unlike the previous setup, edit the CSS source
under `system/assets/` and publish it; server-folder CSS is now an output copy.

## Do not edit these generated copies

- `frontend/monitorBP frontend/` and `frontend/queue frontend/`: published HTML,
  CSS, JavaScript and bundles. Existing image/media directories are runtime assets;
  the publisher does not wipe these folders.
- `frontend/portal-react/dist/` and `system-dist/`: build output.
- `system-react/app.js` or `portal-assets/assets/index-*.js`: compiled bundles.
- `system/reference/`: historical snapshots, not active pages.

`system/manifest.json` maps page sources to deployed filenames.
`system/assets-manifest.json` maps styles/helpers to their unchanged public URLs.
Common assets are authored once and copied to both servers.
