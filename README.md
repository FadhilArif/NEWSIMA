# NEWSIMA

## JavaScript module layout

The browser application is split into small, responsibility-based files under `js/`:

- `01-config-and-access.js` — role/permission constants and workflow-stage rules.
- `02-state-and-context.js` — shared state, common utilities, and account context.
- `03-proker-notifications.js` and `04-proker-details-gallery.js` — Proker, documents, notifications, and gallery data.
- `05-organization-loaders-cache.js` — organization/admin data and view caches.
- `06-ui-helpers-navigation.js`, `07-auth-profile-storage.js`, and `08-shell-and-view-registry.js` — navigation, authentication/upload helpers, and shared shell.
- `js/views/` — grouped page renderers registered on the shared `V` registry.
- `09-render-and-csv.js` — rendering orchestration, photo previews, and CSV utilities.
- `10-events-click.js`, `11-events-input-change.js`, and `12-events-submit-init.js` — delegated UI event handlers and final app initialization.

**Loading order matters.** Scripts remain classic browser scripts (not ES modules) so existing shared state and functions stay compatible during this refactor. `index.html` loads them with `defer` in the declared order; keep the source list in `.github/scripts/check-simawa-v2-workflow-ui.js` synchronized with it. Run the GitHub Actions client security scan before merging.

