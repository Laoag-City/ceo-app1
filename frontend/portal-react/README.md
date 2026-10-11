# React systems portal

The React source for the main systems portal uses Vite, Tailwind CSS, Lucide icons, and a small Radix-based button component.

## Main portal

Open http://localhost:5000/portal.html with the queue server running. The same compiled page is also available at http://localhost:3000/portal.html with the permit server running. No Vite server is needed for the main portal.

The previous HTML implementation has been replaced. The portal.html filename remains as the entry point for existing links. Backend code, APIs, and database schemas are unchanged.

## Edit and publish locally

From this directory:

```powershell
npm.cmd run dev
```

Preview changes at http://127.0.0.1:5173/. After editing, publish:

```powershell
npm.cmd run publish:local
```

If this computer's npm shortcut reports a missing npm-cli.js, use:

```powershell
node 'C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js' run build
node publish-local.mjs
```

The publishing script copies compiled public assets into portal-assets and writes portal.html in the frontend root and both existing static frontend directories. Do not manually edit these generated HTML files. Edit src/main.jsx and src/style.css, then rebuild and publish. Keep portal-assets alongside the entry points when distributing the project.

Service checks use the configured backend reachability endpoints with a timeout. They indicate HTTP reachability, not database health. Theme preference uses the existing engineeringTheme key.

## Verify

- Open the main portal and check images and status badges.
- Toggle light/dark mode and refresh to check persistence.
- Follow both cards and use Return to Portal.
- Narrow the window to check that cards stack.

## Permit and queue pages

Editable system pages now live in system/features, shared components in system/shared, and CSS/browser helpers in system/assets. Use npm.cmd run publish:system after system frontend edits. See ../../WHERE-TO-EDIT.md for exact filenames. Server frontend directories are published copies.
