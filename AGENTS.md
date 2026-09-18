# Agent Instructions

## Current project

- Building a web app for "Ipanema Joias" (multi-store jewelry business) that reads/writes a live Google Sheet as its data store.
- `Fluxo de caixa Ipanema Joias.xlsx` is a local reference copy of that spreadsheet's structure only — the app must talk to the real Google Sheet via the Sheets API, not this file.
- There is currently no application source code, package manager, build system, test suite, or Git repository.
- `TESTE MD` is an empty placeholder and is not an implementation example.
- Read `CLAUDE.md` for the spreadsheet's sheet/column layout and broader project status.

## Working conventions

- Treat the Google Sheet as the source of truth for financial/inventory data; never alter values or formulas in the local `.xlsx` reference copy.
- Match new sheet-reading/writing code to the existing column layout per tab (see `CLAUDE.md`) rather than inventing a new schema, unless the user asks for a structural change.
- Do not introduce a framework, bundler, npm dependency, or generated application structure without an explicit need — plain HTML, CSS, and JavaScript only.
- Google auth uses Google Identity Services (OAuth) directly in the browser, no backend server. The OAuth Client ID and spreadsheet IDs (`js/config.js`, `js/tenants.js`) are committed with real values on purpose — there's no backend, so anything the browser needs is visible in the deployed JS regardless of git history. The real access boundary is Drive sharing + the OAuth Client's Authorized JavaScript origins, not secrecy of these IDs.
- Add run/test commands to `CLAUDE.md` as application code is introduced.

## Validation

- No project-wide validation command exists yet. For future code, add a focused validation command and document it in `CLAUDE.md`.