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

Sign-in opens your **system browser** and returns via a loopback callback (`http://127.0.0.1:9473/callback`). Refresh tokens are stored in the **OS keychain** (macOS Keychain / Windows Credential Manager).

Or run the web UI only (auth requires Tauri):

```bash
npm run dev
```

## Build

```bash
npm run tauri:build
```

Built artifacts are in `src-tauri/target/release/`.

## Architecture

```
focusanalyze-desktop/
├── lib/
│   ├── shared/           # Synced from focusanalyze-fe (API client, services, utils)
│   └── tauri/            # Tauri-only code (auth, keychain, OAuth loopback)
├── src/                  # Legacy native Next shell (tauri:dev:native only)
└── src-tauri/
    └── src/lib.rs        # Rust: OAuth keychain, process tracking, window detection
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
