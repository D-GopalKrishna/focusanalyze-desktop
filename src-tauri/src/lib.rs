mod auth;

use std::collections::HashMap;
use std::io::Cursor;
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};
use sysinfo::System;
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
