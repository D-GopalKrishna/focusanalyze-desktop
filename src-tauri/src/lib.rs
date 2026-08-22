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
// restriction at all. See tauri.fe.conf.json's window `url`, which must match this port.
const LOCALHOST_PORT: u16 = 9843;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let focus_times = Arc::new(Mutex::new(HashMap::new()));
    let focus_times_clone = Arc::clone(&focus_times);

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
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
            local_server::spawn(app.handle().clone(), "localhost", LOCALHOST_PORT);

            // No browser chrome means no reload button and no Cmd+R by default — the only
            // way to recover from a stuck/blank page was quitting and relaunching. Add a
            // real menu with a Reload item (and keep standard Edit items so copy/paste still
            // work in text fields, which a from-scratch menu would otherwise drop).
            {
                use tauri::menu::{Menu, MenuItem, PredefinedMenuItem, SubmenuBuilder};

                let reload_item =
                    MenuItem::with_id(app, "reload", "Reload", true, Some("CmdOrCtrl+R"))?;
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
                    }
                });
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
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
