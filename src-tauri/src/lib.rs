mod auth;
mod local_server;

use std::collections::HashMap;
use std::io::Cursor;
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};
use sysinfo::System;
use tauri::Manager;
use x_win::get_active_window;

#[derive(serde::Serialize, Default, Clone)]
struct ProcessInfo {
    name: String,
    cpu_usage: f32,
    memory: u64,
    uptime: u64,
    focus_time: u64,
    tab_focus_times: HashMap<String, u64>,
}

#[tauri::command]
fn get_processes(focus_times: tauri::State<Arc<Mutex<HashMap<String, u64>>>>) -> Vec<ProcessInfo> {
    let focus_times = focus_times.lock().unwrap();
    collect_processes(&focus_times)
}

fn collect_processes(focus_times: &HashMap<String, u64>) -> Vec<ProcessInfo> {
    let mut system = System::new_all();
    system.refresh_all();

    let mut process_map: HashMap<String, ProcessInfo> = HashMap::new();

    for process in system.processes().values() {
        if is_target_process(process) {
            let name = process.name().to_string_lossy().into_owned();
            let entry = process_map.entry(name.clone()).or_insert_with(|| ProcessInfo {
                name,
                cpu_usage: 0.0,
                memory: 0,
                uptime: 0,
                focus_time: 0,
                tab_focus_times: HashMap::new(),
            });

            entry.cpu_usage += process.cpu_usage();
            entry.memory += process.memory();
            entry.uptime += process.run_time();
            entry.focus_time = *focus_times.get(&entry.name).unwrap_or(&0);
        }
    }

    process_map.into_values().collect()
}

fn is_target_process(process: &sysinfo::Process) -> bool {
    process.cpu_usage() > 0.0
}

#[tauri::command]
fn export_processes_to_csv(
    focus_times: tauri::State<Arc<Mutex<HashMap<String, u64>>>>,
) -> Result<String, String> {
    let focus_times = focus_times.lock().unwrap();
    let processes = collect_processes(&focus_times);
    let mut writer = csv::Writer::from_writer(Cursor::new(Vec::new()));

    writer
        .write_record(&["Name", "CPU Usage", "Memory", "Uptime", "Focus Time"])
        .map_err(|e| e.to_string())?;

    for process in processes {
        writer
            .write_record(&[
                process.name,
                process.cpu_usage.to_string(),
                process.memory.to_string(),
                process.uptime.to_string(),
                process.focus_time.to_string(),
            ])
            .map_err(|e| e.to_string())?;
    }

    writer.flush().map_err(|e| e.to_string())?;
    let data = writer.into_inner().map_err(|e| e.to_string())?.into_inner();
    Ok(String::from_utf8(data).map_err(|e| e.to_string())?)
}

#[tauri::command]
fn get_active_window_title() -> String {
    match get_active_window() {
        Ok(window_info) => window_info.title,
        Err(e) => {
            log::warn!("Failed to get active window: {:?}", e);
            String::new()
        }
    }
}

fn track_focus_time(focus_times: Arc<Mutex<HashMap<String, u64>>>) {
    let mut last_active_window = String::new();
    let mut last_active_time = Instant::now();

    loop {
        let active_window = get_active_window_title();
        if active_window.is_empty() {
            thread::sleep(Duration::from_secs(1));
            continue;
        }

        if active_window != last_active_window {
            let duration = last_active_time.elapsed().as_secs();
            if !last_active_window.is_empty() {
                let mut focus_times = focus_times.lock().unwrap();
                *focus_times.entry(last_active_window.clone()).or_insert(0) += duration;
            }
            log::info!("Focused on '{}' for {} seconds", last_active_window, duration);
            last_active_window = active_window;
            last_active_time = Instant::now();
        }

        thread::sleep(Duration::from_secs(5));
    }
}

// macOS's WKWebView blocks `fetch()` to custom URL schemes like `tauri://` at the engine
// level — a long-standing, still-open Tauri/WKWebView limitation (no app-side CSP/config
// fixes it: https://github.com/tauri-apps/tauri/issues/12662, #946, #10249, #4113). Since
// Next.js's client-side router uses `fetch()` for every in-app navigation (not just
// prefetch), the FE build serves over a real `http://localhost` origin instead of the
// custom protocol — `fetch()` against a genuine http(s) origin isn't affected by this
// restriction at all.
//
// 9843 is an uncommon port, but a real clash with some other local app isn't impossible —
// these are fallbacks, tried in order (see local_server::spawn). Every one of these must be
// listed in capabilities/default.json's `remote.urls` AND in the backend's
// CORS_ALLOWED_ORIGINS (focusanalyze-mind's mind_fa/settings.py + deployment/docker-compose/
// .env.dev), since which port actually gets used isn't known until runtime.
const LOCALHOST_PORTS: &[u16] = &[9843, 9844, 9845, 9846, 9847];

/// The port `local_server::spawn` actually bound to, stashed as app state so the widget
/// toggle commands (invoked later, from menu clicks) can build a window URL without
/// re-deriving it. See the "main" window's own `let url = ...` comment below for why this
/// can't just be a `const`.
struct LocalServerPort(u16);

/// Small companion windows (timer countdown, today's journal + agenda) — separate
/// `WebviewWindow`s rather than in-page overlays, so they float outside the main window and
/// survive it being minimized/backgrounded. The today-widget doubles as the macOS menu-bar
/// tray's click popover; the timer-widget's live countdown is *also* mirrored onto the tray
/// icon's title text (see `set_tray_timer_text`) so it's glanceable with no click at all. See
/// .claude/plan/in-progress/desktop-widget-windows/plan.md for the design.
const WIDGET_TIMER_LABEL: &str = "timer-widget";
const WIDGET_TIMER_ROUTE: &str = "desktop-widget/timer";
const WIDGET_TODAY_LABEL: &str = "today-widget";
const WIDGET_TODAY_ROUTE: &str = "desktop-widget/today";
/// Matches the web Day Journal dialog's own size constants (`JOURNAL_DIALOG_WIDTH_PX`/
/// `JOURNAL_DIALOG_MAX_HEIGHT_PX` in journal-dialog-frame.tsx) so the tray popover looks
/// like the same component, because it renders the same component.
const TODAY_WIDGET_WIDTH: f64 = 440.0;
const TODAY_WIDGET_HEIGHT: f64 = 600.0;

/// Holds the built tray icon so commands invoked later (e.g. the live timer countdown) can
/// update its title. `tauri::tray::TrayIcon` is generic over the runtime; `tauri::Wry` is the
/// concrete one this app always runs on (desktop, not mobile).
struct TrayHandle(tauri::tray::TrayIcon<tauri::Wry>);

/// Where a widget window should appear the first time it's created.
enum WidgetOrigin {
    /// Bottom-right corner of the primary monitor's work area, offset upward by `stack_index`
    /// widget-heights so the corner-docked widgets don't stack exactly on top of each other.
    MonitorCorner { stack_index: f64 },
    /// Top-right corner of the work area of whichever monitor the tray click happened on, just
    /// under the menu bar. Originally hardcoded to the *primary* monitor unconditionally — on a
    /// multi-monitor setup (reported live: 3 external displays + laptop), clicking the tray icon
    /// on a secondary display still opened the widget on the primary one, nowhere near the
    /// click. Fine-grained anchoring under the tray icon's own `rect` was tried before that and
    /// abandoned (its coordinates didn't line up with Tauri's window-position space — popover
    /// landed far below-and-left of the actual icon, live-tested; likely an AppKit
    /// bottom-left-origin vs. top-left-origin mismatch this crate version doesn't normalize).
    /// This only needs coarse monitor *membership*, not per-pixel accuracy, so it sidesteps that
    /// mismatch: resolve which monitor contains the click point via `monitor_from_point`, then
    /// use that monitor's safe, always-correct top-right corner — falls back to the primary
    /// monitor if the point can't be resolved to any display.
    TopRightCornerNearClick(tauri::PhysicalPosition<f64>),
}

/// Create (positioned per `origin`) or toggle-show/hide an existing widget window.
fn toggle_widget_window(
    app: &tauri::AppHandle,
    port: u16,
    label: &str,
    route: &str,
    width: f64,
    height: f64,
    origin: WidgetOrigin,
) -> tauri::Result<()> {
    if let Some(window) = app.get_webview_window(label) {
        if window.is_visible().unwrap_or(false) {
            window.hide()?;
        } else {
            window.show()?;
            window.set_focus()?;
        }
        return Ok(());
    }

    let url = format!("http://localhost:{port}/{route}.html")
        .parse()
        .expect("invalid widget window URL");

    let margin = 24.0;
    let (x, y) = match origin {
        WidgetOrigin::MonitorCorner { stack_index } => {
            let stack_offset = stack_index * (height + 16.0);
            app.primary_monitor()
                .ok()
                .flatten()
                .map(|monitor| {
                    let scale = monitor.scale_factor();
                    let work_area = monitor.work_area();
                    let work_x = work_area.position.x as f64 / scale;
                    let work_y = work_area.position.y as f64 / scale;
                    let work_w = work_area.size.width as f64 / scale;
                    let work_h = work_area.size.height as f64 / scale;
                    (
                        work_x + work_w - width - margin,
                        work_y + work_h - height - margin - stack_offset,
                    )
                })
                .unwrap_or((margin, margin))
        }
        WidgetOrigin::TopRightCornerNearClick(click_point) => app
            .monitor_from_point(click_point.x, click_point.y)
            .ok()
            .flatten()
            .or_else(|| app.primary_monitor().ok().flatten())
            .map(|monitor| {
                let scale = monitor.scale_factor();
                let work_area = monitor.work_area();
                let work_x = work_area.position.x as f64 / scale;
                let work_y = work_area.position.y as f64 / scale;
                let work_w = work_area.size.width as f64 / scale;
                (work_x + work_w - width - margin, work_y + 8.0)
            })
            .unwrap_or((margin, margin)),
    };

    let window = tauri::WebviewWindowBuilder::new(app, label, tauri::WebviewUrl::External(url))
        .title("FocusAnalyze")
        .inner_size(width, height)
        .position(x, y)
        .always_on_top(true)
        .decorations(false)
        // Transparent so the page's own `rounded-xl` card (matching the web Day Journal
        // dialog's look) shows real rounded corners against the desktop instead of a
        // rectangular black window behind rounded content.
        .transparent(true)
        .shadow(false)
        .resizable(false)
        .skip_taskbar(true)
        .visible(true)
        .build()?;

    // The tray popover (today-widget) behaves like a native menu-bar dropdown — it should
    // disappear the moment focus moves elsewhere, not linger like a normal window. The
    // timer-widget stays open regardless (it's meant to sit alongside other work, not be a
    // one-shot popover), so this is opt-in per label rather than a blanket window event.
    if label == WIDGET_TODAY_LABEL {
        let dismiss_handle = window.clone();
        window.on_window_event(move |event| {
            if let tauri::WindowEvent::Focused(false) = event {
                let _ = dismiss_handle.hide();
            }
        });
    }

    Ok(())
}

#[tauri::command]
fn toggle_timer_widget(app: tauri::AppHandle, port: tauri::State<LocalServerPort>) -> Result<(), String> {
    toggle_widget_window(
        &app,
        port.0,
        WIDGET_TIMER_LABEL,
        WIDGET_TIMER_ROUTE,
        220.0,
        140.0,
        WidgetOrigin::MonitorCorner { stack_index: 0.0 },
    )
    .map_err(|e| e.to_string())
}

#[tauri::command]
fn toggle_today_widget(app: tauri::AppHandle, port: tauri::State<LocalServerPort>) -> Result<(), String> {
    toggle_widget_window(
        &app,
        port.0,
        WIDGET_TODAY_LABEL,
        WIDGET_TODAY_ROUTE,
        TODAY_WIDGET_WIDTH,
        TODAY_WIDGET_HEIGHT,
        WidgetOrigin::MonitorCorner { stack_index: 1.0 },
    )
    .map_err(|e| e.to_string())
}

/// Mirror the timer widget's live countdown onto the tray icon's own title text (macOS shows
/// this right next to the icon in the menu bar) — so a running timer is glanceable with no
/// click at all, per the user's "if the timer is on that should also be in the tray" ask.
/// `None`/empty clears it back to just the icon. No-op (not an error) if the tray failed to
/// build for some reason — a missing countdown label is not worth crashing a command over.
#[tauri::command]
fn set_tray_timer_text(tray: tauri::State<TrayHandle>, text: Option<String>) -> Result<(), String> {
    tray.0.set_title(text).map_err(|e| e.to_string())
}

/// Shows + focuses the "main" window and, when `path` is given, navigates it there — used by
/// the today-widget's "View plan"/"View report"/"Generate report" actions, which normally open
/// a modal that only the main window's own React tree knows how to render (that tree, its
/// jotai atoms, etc. aren't mounted in the small tray popover). A full navigation is a coarser
/// UX than opening the exact same modal in place, but avoids duplicating that modal
/// infrastructure into a second window just for this. `path` is JSON-escaped before being
/// embedded in the injected script — it's server/app-constructed today, not raw user input, but
/// cheap enough to do properly regardless of the current caller.
#[tauri::command]
fn focus_main_window(app: tauri::AppHandle, path: Option<String>) -> Result<(), String> {
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "main window not found".to_string())?;
    window.show().map_err(|e| e.to_string())?;
    window.set_focus().map_err(|e| e.to_string())?;
    if let Some(path) = path {
        let encoded = serde_json::to_string(&path).map_err(|e| e.to_string())?;
        window
            .eval(&format!("window.location.assign({encoded})"))
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

// focusanalyze-desktop's GitHub repo is private, so the updater's manifest fetch
// (`releases/latest/download/latest.json`) and the artifact download that follows both need
// an Authorization header GitHub will accept for a private repo. The token is baked in at
// compile time (not read from the user's shell at runtime) so a plain double-click launch of
// the built app still works — set TAURI_UPDATER_GH_TOKEN when running `tauri build`/
// `npm run tauri:build:fe` to embed a fine-grained PAT scoped to Contents:read-only on this
// repo. Local/dev builds simply omit it: the updater check will 401 and log, which is fine
// since dev builds never need to self-update.
fn build_updater_plugin<R: tauri::Runtime>(
) -> tauri::plugin::TauriPlugin<R, tauri_plugin_updater::Config> {
    let mut builder = tauri_plugin_updater::Builder::new();
    if let Some(token) = option_env!("TAURI_UPDATER_GH_TOKEN") {
        if !token.is_empty() {
            builder = builder.header("Authorization", format!("Bearer {token}")).unwrap();
        }
    }
    builder.build()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let focus_times = Arc::new(Mutex::new(HashMap::new()));
    let focus_times_clone = Arc::clone(&focus_times);

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_process::init())
        .plugin(build_updater_plugin())
        .manage(focus_times)
        .setup(move |app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            // Replaces tauri-plugin-localhost, which has no fallback for the dynamic-ID
            // routes' placeholder files (see local_server.rs) — clicking into a real
            // project/task/goal/etc. 500'd because the plugin only does exact-path lookups.
            let port = local_server::spawn(app.handle().clone(), "localhost", LOCALHOST_PORTS);

            // The window is built here instead of declaratively in tauri.fe.conf.json's
            // `windows` array because its URL depends on which port local_server actually
            // bound — not known until runtime. tauri.fe.conf.json declares an empty
            // `windows: []` so Tauri doesn't also try to create a default one.
            let url = format!("http://localhost:{port}/desktop-auth.html")
                .parse()
                .expect("invalid local server URL");
            tauri::WebviewWindowBuilder::new(app, "main", tauri::WebviewUrl::External(url))
                .title("FocusAnalyze")
                .inner_size(1280.0, 800.0)
                .min_inner_size(800.0, 600.0)
                .resizable(true)
                .build()?;

            app.manage(LocalServerPort(port));

            // No browser chrome means no reload button and no Cmd+R by default — the only
            // way to recover from a stuck/blank page was quitting and relaunching. Add a
            // real menu with a Reload item (and keep standard Edit items so copy/paste still
            // work in text fields, which a from-scratch menu would otherwise drop).
            {
                use tauri::menu::{Menu, MenuItem, PredefinedMenuItem, SubmenuBuilder};

                let reload_item =
                    MenuItem::with_id(app, "reload", "Reload", true, Some("CmdOrCtrl+R"))?;
                let timer_widget_item = MenuItem::with_id(
                    app,
                    "toggle-timer-widget",
                    "Timer Widget",
                    true,
                    Some("CmdOrCtrl+Shift+T"),
                )?;
                let today_widget_item = MenuItem::with_id(
                    app,
                    "toggle-today-widget",
                    "Today Widget",
                    true,
                    Some("CmdOrCtrl+Shift+J"),
                )?;
                let app_menu = SubmenuBuilder::new(app, "FocusAnalyze")
                    .item(&PredefinedMenuItem::about(app, None, None)?)
                    .separator()
                    .item(&PredefinedMenuItem::quit(app, None)?)
                    .build()?;
                let edit_menu = SubmenuBuilder::new(app, "Edit")
                    .item(&PredefinedMenuItem::undo(app, None)?)
                    .item(&PredefinedMenuItem::redo(app, None)?)
                    .separator()
                    .item(&PredefinedMenuItem::cut(app, None)?)
                    .item(&PredefinedMenuItem::copy(app, None)?)
                    .item(&PredefinedMenuItem::paste(app, None)?)
                    .item(&PredefinedMenuItem::select_all(app, None)?)
                    .build()?;
                let view_menu = SubmenuBuilder::new(app, "View")
                    .item(&reload_item)
                    .separator()
                    .item(&timer_widget_item)
                    .item(&today_widget_item)
                    .build()?;
                let window_menu = SubmenuBuilder::new(app, "Window")
                    .item(&PredefinedMenuItem::minimize(app, None)?)
                    .item(&PredefinedMenuItem::close_window(app, None)?)
                    .build()?;
                let menu = Menu::with_items(app, &[&app_menu, &edit_menu, &view_menu, &window_menu])?;
                app.set_menu(menu)?;

                app.on_menu_event(move |app_handle, event| {
                    if event.id() == "reload" {
                        if let Some(window) = app_handle.get_webview_window("main") {
                            let _ = window.eval("window.location.reload()");
                        }
                    } else if event.id() == "toggle-timer-widget" {
                        let _ = toggle_widget_window(
                            app_handle,
                            port,
                            WIDGET_TIMER_LABEL,
                            WIDGET_TIMER_ROUTE,
                            220.0,
                            140.0,
                            WidgetOrigin::MonitorCorner { stack_index: 0.0 },
                        );
                    } else if event.id() == "toggle-today-widget" {
                        let _ = toggle_widget_window(
                            app_handle,
                            port,
                            WIDGET_TODAY_LABEL,
                            WIDGET_TODAY_ROUTE,
                            TODAY_WIDGET_WIDTH,
                            TODAY_WIDGET_HEIGHT,
                            WidgetOrigin::MonitorCorner { stack_index: 1.0 },
                        );
                    }
                });
            }

            // macOS menu-bar tray icon — the primary way to reach the today-widget popover
            // (journal + agenda) per the user's "it should be in the tray, where I can click"
            // ask. Left-click toggles the popover anchored right under the icon; the timer's
            // live countdown is mirrored onto this icon's title text separately (see
            // set_tray_timer_text), so a running timer is visible with no click at all.
            //
            // Deliberately non-fatal: this used to `?`-propagate a build failure straight out
            // of `setup()`, which (per Tauri's own error handling around `.run()`) can abort
            // the *entire* app — main window included — over a tray-only problem. Log and skip
            // instead so a tray issue never takes down everything else in this block.
            {
                use tauri::tray::{TrayIconBuilder, TrayIconEvent};

                let tray_icon = app.default_window_icon().cloned();
                match tray_icon {
                    None => {
                        log::warn!("[focusanalyze-desktop] no default window icon available — skipping tray icon");
                    }
                    Some(icon) => {
                        // Not marked `.icon_as_template(true)` — that renders the icon as a
                        // solid black/white silhouette from its alpha channel, which looks
                        // broken on the app's full-color logo (no dedicated monochrome tray
                        // asset exists yet). Using the regular icon is less "native macOS" but
                        // avoids a garbled tray glyph; add a real template asset under icons/
                        // as a follow-up if this looks bad.
                        let build_result = TrayIconBuilder::with_id("main-tray")
                            .icon(icon)
                            .tooltip("FocusAnalyze")
                            .on_tray_icon_event(move |tray_handle, event| {
                                if let TrayIconEvent::Click {
                                    button: tauri::tray::MouseButton::Left,
                                    button_state: tauri::tray::MouseButtonState::Up,
                                    position,
                                    ..
                                } = event
                                {
                                    let app_handle = tray_handle.app_handle();
                                    let _ = toggle_widget_window(
                                        app_handle,
                                        port,
                                        WIDGET_TODAY_LABEL,
                                        WIDGET_TODAY_ROUTE,
                                        TODAY_WIDGET_WIDTH,
                                        TODAY_WIDGET_HEIGHT,
                                        WidgetOrigin::TopRightCornerNearClick(position),
                                    );
                                }
                            })
                            .build(app);

                        match build_result {
                            Ok(tray) => {
                                app.manage(TrayHandle(tray));
                            }
                            Err(e) => {
                                log::warn!("[focusanalyze-desktop] failed to build tray icon: {e}");
                            }
                        }
                    }
                }
            }

            thread::spawn(move || {
                track_focus_time(focus_times_clone);
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_processes,
            export_processes_to_csv,
            get_active_window_title,
            auth::save_auth_tokens,
            auth::load_auth_tokens,
            auth::clear_auth_tokens,
            auth::begin_oauth_callback_listener,
            auth::cancel_oauth_callback_listener,
            auth::wait_oauth_callback,
            auth::exchange_oauth_code,
            auth::refresh_oauth_tokens,
            toggle_timer_widget,
            toggle_today_widget,
            set_tray_timer_text,
            focus_main_window,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
