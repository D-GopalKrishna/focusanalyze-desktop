# FocusAnalyze Desktop

Cross-platform desktop app for local system analytics and focus-time tracking. Ported from the `focusanalyze-poc/syspoc` proof of concept.

## What it does

- Tracks the **foreground window** title in the background (via `x-win`)
- Aggregates **per-app focus time** while you work
- Lists active processes with CPU, memory, and uptime (via `sysinfo`)
- Displays a dashboard with charts and exportable CSV

## Prerequisites

- [Node.js](https://nodejs.org/) 20+
- [Rust](https://www.rust-lang.org/tools/install) (see [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/))
- **macOS**: Accessibility permission may be required for window title detection
- **Windows**: Build on a Windows machine for native builds

## Setup

```bash
cd focusanalyze-desktop
npm install
```

## Sync from focusanalyze-fe

Shared API client, services, utils, and Keycloak config are synced from `focusanalyze-fe` (same pattern as mobile).

**Branch matching:** `sync:frontend` reads the desktop repo’s current branch (`main`, `develop`, etc.) and checks out the **same branch** in `../focusanalyze-fe` before copying.

```bash
# Sync lib/shared from FE (default: ../focusanalyze-fe, match desktop branch)
npm run sync:frontend

# Sync without switching FE branch (warn if mismatch)
npm run sync:frontend:check

# Override branch
npm run sync:frontend -- --branch main
```

Writes `frontend-ref.json` (gitignored) — used by `tauri:dev:fe` to locate the FE checkout.

Imported paths land in `lib/shared/` with `@shared/*` TypeScript aliases. See `scripts/sync-frontend-manifest.json`.

## Development

Two desktop shells:

| Command | UI | Use when |
|---------|-----|----------|
| `npm run tauri:dev` | Full **focusanalyze-fe** in Tauri (`IS_TAURI=true`) | Default — same web app as browser, in the desktop shell |
| `npm run tauri:dev:native` | Desktop-native (`src/`) — legacy shell | Rust/system prototype only (no full dashboard) |

`tauri:dev` runs `sync:frontend` first, then starts FE’s Next dev server and opens Tauri against `/desktop-auth`.

Two backend targets (local vs remote Keycloak/API):

**Local stack** — Django on `:8000`, Keycloak on `:8080` (uses `.env.local`):

```bash
npm run tauri:dev
# or explicitly:
npm run tauri:dev:local
```

**Remote stack** — `mind.focusanalyze.com` + `accounts.focusanalyze.com`:

```bash
npm run tauri:dev:remote
```

> The `focusanalyze-desktop` Keycloak client must exist on the target realm (local realm JSON includes it; staging/prod need the same client provisioned).

Sign-in opens your **system browser** and returns via a loopback callback (`http://127.0.0.1:9473/callback`). Tokens are stored in a file in the app data folder that only your OS user can read (`auth-tokens.json`), not the OS keychain, because an unsigned app would trigger repeated password prompts.

Or run the web UI only (auth requires Tauri):

```bash
npm run dev
```

## Build

Same two-shell split as dev — **use the `:fe` command**, not the bare one, to get the real app:

```bash
npm run tauri:build:fe
```

`npm run tauri:build` (no `:fe`) builds the *other* config — the legacy native shell in `src/`, not focusanalyze-fe. It's easy to run the wrong one by habit; if the resulting `.app` shows a bare system-analytics prototype instead of the FocusAnalyze dashboard, that's why.

Built artifacts are in `src-tauri/target/release/bundle/` (`.app` + `.dmg` on macOS).

### Tauri production build scope

`tauri:build:fe` runs `scripts/build-fe.js`, which does `IS_TAURI=true next build` inside `focusanalyze-fe` (its `next.config.js` sets `output: 'export'` under `IS_TAURI=true`). Next's static export requires every route to be statically renderable — `focusanalyze-fe` is a full web app (marketing site + auth + dashboard), and plenty of its routes aren't: real dynamic API routes (cookies, POST bodies, secrets), a Sanity Studio CMS mount, and DB-ID path params Next can't know at build time.

The desktop app only ever shows the **authenticated dashboard** post-login (see "Development" above — login is Tauri's own system-browser OAuth flow, no in-app signup), so `build-fe.js` scopes the build to that instead of trying to export the whole site:

1. Before `next build`, it reads `scripts/tauri-build-scope.json` (paths relative to `focusanalyze-fe/`) and `fs.renameSync`s each one out of `app/` into a temp stash dir. This excludes the marketing site (`(non-auth)`, `(embed)`), the Sanity Studio route, the dead/unused API routes, and a handful of legacy redirect-only dashboard routes (`habits/[habit_id]`, `task/[task_id]`, `tracks/[track_id]`, `settings/[setting]`) that exist solely so old external links still resolve — irrelevant to a fresh desktop install.
2. Runs `next build` against what's left.
3. Restores every excluded path in a `finally` (plus `SIGINT`/`SIGTERM` handlers), so `focusanalyze-fe`'s working tree is untouched once the script exits, success or failure.

**Genuinely dynamic dashboard routes** (project/goal/release/team/user IDs — not excludable, real active UI) get `generateStaticParams()` returning a single `'placeholder'` value instead. This works because every one of those pages is a client component that resolves its real ID from the browser URL at runtime via `useParams()`/`use(params)` — which static HTML shell Next served is irrelevant to what renders; the placeholder param just satisfies the export requirement. (Caveat: a hard reload while sitting on one of these deep URLs would 404, since only the placeholder path has a matching static file — client-side navigation, which is how the app is normally used, isn't affected.)

If you add a new dashboard route with a dynamic `[param]` segment, it needs the same treatment (`generateStaticParams` with a placeholder) or the Tauri build will fail with `Page "..." is missing "generateStaticParams()"`. If you add a new marketing-only or genuinely server-dynamic route, add it to `tauri-build-scope.json` instead. See [.claude/plan/in-progress/desktop-dashboard-scoped-build/plan.md](../.claude/plan/in-progress/desktop-dashboard-scoped-build/plan.md) for the full route-by-route rationale.

## Architecture

```
focusanalyze-desktop/
├── lib/
│   ├── shared/           # Synced from focusanalyze-fe (API client, services, utils)
│   └── tauri/            # Tauri-only code (auth, OAuth loopback)
├── src/                  # Legacy native Next shell (tauri:dev:native only)
└── src-tauri/
    └── src/lib.rs        # Rust: process tracking, window detection
```

Desktop login UI lives in **focusanalyze-fe** (`app/(tauri-shell)/desktop-auth`, `lib/tauri/auth/`).

### Tauri commands

| Command | Description |
|---------|-------------|
| `get_processes` | Returns running processes with CPU, memory, focus time |
| `get_active_window_title` | Returns the current foreground window title |
| `export_processes_to_csv` | Returns process data as CSV string |

## Origin

This app was migrated from `focusanalyze-poc/syspoc`. The POC README build notes for Linux/Windows/macOS VMs remain applicable for cross-platform builds.

## Next steps

- Menu bar / system tray (always-on background agent)
- Local SQLite storage for focus events
- Sync to `focusanalyze-mind` API with Keycloak auth
- Focus mode / distraction blocking
