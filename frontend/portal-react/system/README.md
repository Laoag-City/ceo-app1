# System frontend source

Start with the root WHERE-TO-EDIT.md for individual page filenames.

- features/: page JSX and matching HTML/controller shells, grouped by feature.
- shared/: navigation and the trusted legacy-attribute bridge.
- assets/: authored CSS and browser scripts. Common contains identical shared files; permits and queue retain system-specific behavior.
- tests/: automated checks; fixtures retain controller IDs and the organization comparison snapshots.
- reference/: historical snapshots and retired migration tools. Never run the old importer.
- manifest.json: source page paths and unchanged served destinations.
- assets-manifest.json: explicitly published browser assets. Nothing else is copied.

React mounts layouts once. Legacy controllers then own dynamic forms, tables and dialogs. Do not add root rerenders or StrictMode replay without migrating those controllers. The sidebar owns only its own state.

From frontend/portal-react, run npm.cmd run publish:system. This builds, runs all frontend tests, and publishes the bundle, HTML shells and assets. CSS changes also need publication now. Images, uploaded media, databases and backend processes are not touched by this publisher.

Tests protect control IDs, inline-script syntax, filters, queue controls, submission handling, routing, sidebar drafts and printing. Setting VERIFY_ORGANIZATION=1 also compares exact rendered markup and static bytes with the snapshots captured before the file move. Leave this optional check off for intentional UI/content edits. Update control-ids.json only when a controller target is deliberately added/retired with its controller change.

Historical pre-React layout comparisons were moved under reference because those snapshots predate subsequent intentional UI features. The current tests use the actual working pre-organization bundle as their reference.
