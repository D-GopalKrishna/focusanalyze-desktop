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

## Development

Run the Tauri desktop app (starts Next.js dev server + native shell):

```bash
npm run tauri:dev
```

Or run the web UI only:

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
├── src/                  # Next.js UI (static export for Tauri)
│   └── app/page.tsx      # Task manager dashboard
└── src-tauri/
    └── src/lib.rs        # Rust: process tracking, focus time, window detection
```

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
