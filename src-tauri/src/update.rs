use std::sync::Mutex;
use tauri::{AppHandle, Manager};
use tauri_plugin_updater::{Update, UpdaterExt};

/// An update already downloaded and signature-checked, waiting for the app to quit.
#[derive(Default)]
pub struct PendingUpdate(Mutex<Option<(Update, Vec<u8>)>>);

/// "Later" in the update dialog: downloads now, installs on the next quit. This lives in Rust
/// because the webview can't reliably run anything while the app is exiting. Returns the
/// version, or `None` if there is no update after all.
#[tauri::command]
pub async fn install_update_on_quit(app: AppHandle) -> Result<Option<String>, String> {
    if cfg!(debug_assertions) {
        return Err("Updates are disabled in development builds".to_string());
    }
    let updater = app.updater().map_err(|e| e.to_string())?;
    let Some(update) = updater.check().await.map_err(|e| e.to_string())? else {
        return Ok(None);
    };
    let bytes = update
        .download(|_, _| {}, || {})
        .await
        .map_err(|e| e.to_string())?;
    let version = update.version.clone();
    *app.state::<PendingUpdate>()
        .0
        .lock()
        .map_err(|_| "Update lock poisoned".to_string())? = Some((update, bytes));
    Ok(Some(version))
}

/// Called once as the app exits. A failure just leaves the current version in place, and the
/// periodic check offers the update again on the next launch.
pub fn install_pending(app: &AppHandle) {
    let pending = app
        .state::<PendingUpdate>()
        .0
        .lock()
        .ok()
        .and_then(|mut guard| guard.take());
    if let Some((update, bytes)) = pending {
        if let Err(e) = update.install(bytes) {
            eprintln!("[focusanalyze-desktop] failed to install update on quit: {e}");
        }
    }
}
