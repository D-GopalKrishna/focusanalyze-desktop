//! Opt-in activity collector: app, window title and website host. Nothing runs until the web app
//! calls `activity_start`, which it only does once the user has turned tracking on.

mod buffer;
mod icon;
mod session;
mod upload;

use buffer::{Buffer, IconRow};
use session::{Action, Tracker, Window};
use std::collections::HashSet;
use std::panic::{catch_unwind, AssertUnwindSafe};
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager};

const SAMPLE_INTERVAL: Duration = Duration::from_secs(2);
const SUBJECT_REFRESH_MS: i64 = 60_000;
const MAX_BATCHES_PER_CYCLE: usize = 40;
const ICON_REFRESH_MS: i64 = 30 * 24 * 60 * 60 * 1_000;
const ICON_BATCH_SIZE: usize = 20;
const MAX_PAUSE_MINUTES: i64 = 24 * 60;

struct Inner {
    tracker: Tracker,
    buffer: Buffer,
    enabled: bool,
    paused_until_ms: i64,
    sub: Option<String>,
    sub_checked_ms: i64,
    api_base: String,
    upload_due_ms: i64,
    backoff_ms: i64,
    last_upload_ms: Option<i64>,
    last_error: Option<String>,
    /// Apps whose icon was already tried this run, so a failing read isn't repeated every tick.
    icons_tried: HashSet<(String, String)>,
}

static STATE: OnceLock<Mutex<Inner>> = OnceLock::new();

fn now_ms() -> i64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis() as i64).unwrap_or(0)
}

fn new_id() -> String {
    uuid::Uuid::new_v4().to_string()
}

/// A poisoned lock must not stop collection for good: the data behind it stays consistent because
/// every write is its own SQLite statement.
fn lock() -> Option<std::sync::MutexGuard<'static, Inner>> {
    STATE.get().map(|m| m.lock().unwrap_or_else(|e| e.into_inner()))
}

fn apply(inner: &Inner, actions: Vec<Action>) {
    let Some(sub) = inner.sub.as_deref() else { return };
    for action in actions {
        let result = match &action {
            Action::Checkpoint(s) => inner.buffer.save(sub, s, true),
            Action::Close(s) => inner.buffer.save(sub, s, false),
            Action::Discard(id) => inner.buffer.discard(id),
        };
        if let Err(e) = result {
            log::warn!("[activity] buffer write failed: {e}");
        }
    }
}

fn flush(inner: &mut Inner) {
    let actions = inner.tracker.flush(now_ms());
    apply(inner, actions);
}

fn current_subject() -> Option<String> {
    let stored = crate::auth::load_auth_tokens().ok().flatten()?;
    upload::subject_of(&upload::access_token_from(&stored)?)
}

/// Only the host is kept. The path and query can hold secrets, so they never leave this function.
fn host_from_url(url: &str) -> Option<String> {
    let url = url.trim();
    let rest = url
        .get(..8)
        .filter(|p| p.eq_ignore_ascii_case("https://"))
        .map(|_| &url[8..])
        .or_else(|| url.get(..7).filter(|p| p.eq_ignore_ascii_case("http://")).map(|_| &url[7..]))?;
    let authority = rest.split(['/', '?', '#']).next()?;
    let host_port = authority.rsplit('@').next()?;
    let host = host_port.split(':').next()?.to_ascii_lowercase();
    let host = host.strip_prefix("www.").unwrap_or(&host);
    let valid = !host.is_empty()
        && host.len() <= 253
        && host.chars().all(|c| c.is_ascii_alphanumeric() || c == '.' || c == '-');
    valid.then(|| host.to_string())
}

fn is_browser_name(name: &str) -> bool {
    const BROWSERS: &[&str] = &[
        "chrome", "chromium", "safari", "firefox", "edge", "msedge", "brave", "arc", "vivaldi",
        "opera",
    ];
    let name = name.to_ascii_lowercase();
    BROWSERS.iter().any(|b| name.split(|c: char| !c.is_alphanumeric()).any(|part| part == *b))
}

fn sample_window(
    known: impl Fn(&str, &str) -> Option<Option<String>>,
) -> Option<(Window, x_win::WindowInfo)> {
    let info = x_win::get_active_window().ok()?;
    let app_name = info.info.name.trim().to_string();
    let exec_name = info.info.exec_name.trim().to_string();
    let app_key = if exec_name.is_empty() { app_name.clone() } else { exec_name };
    if app_key.is_empty() {
        return None;
    }
    let is_browser = is_browser_name(&app_name);
    let title = info.title.trim().to_string();
    let domain = match known(&app_key, &title) {
        Some(domain) => domain,
        None if is_browser => {
            x_win::get_browser_url(&info).ok().and_then(|url| host_from_url(&url))
        }
        None => None,
    };
    let window = Window {
        app_name: if app_name.is_empty() { app_key.clone() } else { app_name },
        app_key,
        is_browser,
        title,
        domain,
    };
    Some((window, info))
}

#[cfg(any(target_os = "macos", target_os = "windows"))]
fn idle_ms() -> i64 {
    user_idle::UserIdle::get_time().map(|i| i.as_seconds() as i64 * 1_000).unwrap_or(0)
}

// Linux is out of scope for tracking; `activity_status` reports it as unsupported.
#[cfg(not(any(target_os = "macos", target_os = "windows")))]
fn idle_ms() -> i64 {
    0
}

fn sample_once() {
    let now = now_ms();
    {
        let Some(mut inner) = lock() else { return };
        if !inner.enabled {
            return;
        }
        if now - inner.sub_checked_ms >= SUBJECT_REFRESH_MS {
            inner.sub_checked_ms = now;
            let sub = current_subject();
            if sub != inner.sub {
                flush(&mut inner);
                inner.sub = sub;
            }
        }
        if inner.sub.is_none() || now < inner.paused_until_ms {
            flush(&mut inner);
            return;
        }
    }

    // Reading a website can take a moment (osascript on macOS), so it happens outside the lock.
    // `known` needs the tracker, which is why it takes the lock for just that lookup.
    let sample = sample_window(|app, title| lock().and_then(|i| i.tracker.known_domain(app, title)));
    let (window, info) = match sample {
        Some((window, info)) => (Some(window), Some(info)),
        None => (None, None),
    };
    let idle = idle_ms();

    let Some(mut inner) = lock() else { return };
    // Tracking may have been stopped or paused while the window was being read.
    if !inner.enabled || inner.sub.is_none() || now_ms() < inner.paused_until_ms {
        return;
    }
    let icon_needed = window.as_ref().filter(|w| icon_is_due(&mut inner, &w.app_key)).cloned();
    let actions = inner.tracker.tick(now_ms(), idle, window);
    apply(&inner, actions);
    let sub = inner.sub.clone();
    drop(inner);

    if let (Some(window), Some(info), Some(sub)) = (icon_needed, info, sub) {
        store_icon(&sub, &window, &info);
    }
}

fn icon_is_due(inner: &mut Inner, app_key: &str) -> bool {
    let Some(sub) = inner.sub.clone() else { return false };
    if !inner.icons_tried.insert((sub.clone(), app_key.to_string())) {
        return false;
    }
    match inner.buffer.icon_read_ms(&sub, app_key) {
        Ok(Some(read_ms)) => now_ms() - read_ms >= ICON_REFRESH_MS,
        Ok(None) => true,
        Err(_) => false,
    }
}

fn store_icon(sub: &str, window: &Window, info: &x_win::WindowInfo) {
    // An app without a readable icon simply shows the letter tile.
    let Some(png) = x_win::get_window_icon(info).ok().and_then(|i| icon::normalize(&i.data)) else {
        return;
    };
    let row = IconRow {
        app_key: window.app_key.clone(),
        app_name: window.app_name.clone(),
        is_browser: window.is_browser,
        png,
    };
    if let Some(inner) = lock() {
        if let Err(e) = inner.buffer.save_icon(sub, &row, now_ms()) {
            log::warn!("[activity] icon save failed: {e}");
        }
    }
}

fn upload_icons(api_base: &str, token: &str, sub: &str) {
    let icons = {
        let Some(inner) = lock() else { return };
        inner.buffer.pending_icons(sub, ICON_BATCH_SIZE).unwrap_or_default()
    };
    if icons.is_empty() {
        return;
    }
    // Icons are cosmetic: a failure is retried next cycle and never affects activity uploads.
    let outcome = upload::send(api_base, upload::ICONS_PATH, token, &upload::icons_payload(&icons));
    if outcome == upload::Outcome::Delivered {
        if let Some(inner) = lock() {
            if let Err(e) = inner.buffer.mark_icons_uploaded(sub, &icons) {
                log::warn!("[activity] icon state update failed: {e}");
            }
        }
    }
}

fn upload_cycle() {
    let (api_base, device_id, token, sub) = {
        let Some(mut inner) = lock() else { return };
        let now = now_ms();
        if !inner.enabled || now < inner.upload_due_ms || inner.api_base.is_empty() {
            return;
        }
        let Some(sub) = inner.sub.clone() else { return };
        inner.upload_due_ms = now + upload::BASE_INTERVAL_MS;
        if let Err(e) = inner.buffer.prune(now) {
            log::warn!("[activity] prune failed: {e}");
        }
        let token = crate::auth::load_auth_tokens()
            .ok()
            .flatten()
            .and_then(|stored| upload::access_token_from(&stored));
        let Some(token) = token else { return };
        // The keychain may hold a different account than the rows being sent.
        if upload::subject_of(&token).as_deref() != Some(sub.as_str()) {
            return;
        }
        let device_id = inner.buffer.device_id(new_id).unwrap_or_default();
        (inner.api_base.clone(), device_id, token, sub)
    };

    for _ in 0..MAX_BATCHES_PER_CYCLE {
        let rows = {
            let Some(inner) = lock() else { return };
            inner.buffer.pending(&sub, upload::BATCH_SIZE).unwrap_or_default()
        };
        if rows.is_empty() {
            break;
        }
        let body = upload::payload(&device_id, &rows);
        let outcome = upload::send(&api_base, upload::SEGMENTS_PATH, &token, &body);

        let Some(mut inner) = lock() else { return };
        match outcome {
            upload::Outcome::Delivered => {
                let ids: Vec<String> = rows.into_iter().map(|r| r.id).collect();
                if let Err(e) = inner.buffer.remove(&ids) {
                    log::warn!("[activity] buffer cleanup failed: {e}");
                }
                inner.last_upload_ms = Some(now_ms());
                inner.last_error = None;
                inner.backoff_ms = upload::BASE_INTERVAL_MS;
            }
            upload::Outcome::Unauthorized => return,
            upload::Outcome::TrackingDisabled => {
                inner.enabled = false;
                flush(&mut inner);
                if let Err(e) = inner.buffer.purge_user(&sub) {
                    log::warn!("[activity] buffer purge failed: {e}");
                }
                return;
            }
            upload::Outcome::Retry(reason) => {
                log::warn!("[activity] upload failed: {reason}");
                inner.last_error = Some(reason);
                inner.backoff_ms = upload::next_backoff(inner.backoff_ms);
                inner.upload_due_ms = now_ms() + inner.backoff_ms;
                return;
            }
        }
    }
    upload_icons(&api_base, &token, &sub);
}

/// A panic inside a platform API must not silently end collection for the rest of the session.
fn guarded(name: &str, f: fn()) {
    if let Err(payload) = catch_unwind(AssertUnwindSafe(f)) {
        let reason = payload
            .downcast_ref::<&str>()
            .map(|s| s.to_string())
            .or_else(|| payload.downcast_ref::<String>().cloned())
            .unwrap_or_default();
        log::warn!("[activity] {name} panicked; continuing: {reason}");
    }
}

fn initialize(app: &AppHandle) -> Result<(), String> {
    if STATE.get().is_some() {
        return Ok(());
    }
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let conn = rusqlite::Connection::open(dir.join("activity.sqlite3")).map_err(|e| e.to_string())?;
    let buffer = Buffer::open(conn).map_err(|e| e.to_string())?;
    buffer.recover_open().map_err(|e| e.to_string())?;

    let paused_until_ms = buffer.paused_until_ms();
    let inner = Inner {
        tracker: Tracker::new(Box::new(new_id)),
        buffer,
        enabled: false,
        paused_until_ms,
        sub: None,
        sub_checked_ms: 0,
        api_base: String::new(),
        upload_due_ms: 0,
        backoff_ms: upload::BASE_INTERVAL_MS,
        last_upload_ms: None,
        last_error: None,
        icons_tried: HashSet::new(),
    };
    if STATE.set(Mutex::new(inner)).is_err() {
        return Ok(());
    }

    std::thread::spawn(|| loop {
        guarded("sampler", sample_once);
        std::thread::sleep(SAMPLE_INTERVAL);
    });
    std::thread::spawn(|| loop {
        guarded("uploader", upload_cycle);
        std::thread::sleep(Duration::from_secs(5));
    });
    Ok(())
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ActivityStatus {
    supported: bool,
    running: bool,
    paused_until_ms: Option<i64>,
    pending_count: i64,
    last_upload_ms: Option<i64>,
    last_error: Option<String>,
    needs_screen_permission: bool,
}

#[cfg(target_os = "macos")]
fn has_screen_permission() -> bool {
    #[link(name = "CoreGraphics", kind = "framework")]
    extern "C" {
        fn CGPreflightScreenCaptureAccess() -> bool;
    }
    unsafe { CGPreflightScreenCaptureAccess() }
}

#[cfg(not(target_os = "macos"))]
fn has_screen_permission() -> bool {
    true
}

#[tauri::command]
pub fn activity_start(app: AppHandle, api_base_url: String) -> Result<(), String> {
    if !cfg!(any(target_os = "macos", target_os = "windows")) {
        return Err("activity tracking is not available on this platform".into());
    }
    initialize(&app)?;
    let Some(mut inner) = lock() else { return Err("activity collector unavailable".into()) };
    inner.api_base = api_base_url;
    inner.enabled = true;
    inner.sub_checked_ms = 0;
    Ok(())
}

/// `purge` clears what has not been uploaded: used when the user turns tracking off.
#[tauri::command]
pub fn activity_stop(purge: bool) -> Result<(), String> {
    let Some(mut inner) = lock() else { return Ok(()) };
    flush(&mut inner);
    inner.enabled = false;
    if purge {
        inner.buffer.purge_all().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn activity_pause(minutes: Option<i64>) -> Result<(), String> {
    let Some(mut inner) = lock() else { return Ok(()) };
    match minutes {
        Some(minutes) if minutes > 0 => {
            flush(&mut inner);
            inner.paused_until_ms = now_ms() + minutes.min(MAX_PAUSE_MINUTES) * 60_000;
        }
        _ => inner.paused_until_ms = 0,
    }
    inner.buffer.set_paused_until_ms(inner.paused_until_ms).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn activity_upload_now() -> Result<(), String> {
    let Some(mut inner) = lock() else { return Ok(()) };
    flush(&mut inner);
    inner.upload_due_ms = 0;
    Ok(())
}

#[tauri::command]
pub fn activity_status() -> ActivityStatus {
    let supported = cfg!(any(target_os = "macos", target_os = "windows"));
    let mut status = ActivityStatus {
        supported,
        running: false,
        paused_until_ms: None,
        pending_count: 0,
        last_upload_ms: None,
        last_error: None,
        needs_screen_permission: supported && !has_screen_permission(),
    };
    if let Some(inner) = lock() {
        status.running = inner.enabled;
        status.paused_until_ms = Some(inner.paused_until_ms).filter(|until| *until > now_ms());
        status.pending_count = inner
            .sub
            .as_deref()
            .and_then(|sub| inner.buffer.pending_count(sub).ok())
            .unwrap_or(0);
        status.last_upload_ms = inner.last_upload_ms;
        status.last_error = inner.last_error.clone();
    }
    status
}

#[tauri::command]
pub fn activity_open_screen_permission() -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        #[link(name = "CoreGraphics", kind = "framework")]
        extern "C" {
            fn CGRequestScreenCaptureAccess() -> bool;
        }
        // Registers the app in the list, and is what shows the system prompt the first time.
        if !unsafe { CGRequestScreenCaptureAccess() } {
            std::process::Command::new("open")
                .arg("x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture")
                .spawn()
                .map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_the_host_survives() {
        let cases = [
            ("https://www.GitHub.com/org/repo?token=secret#x", Some("github.com")),
            ("http://user:pass@localhost:3000/reset?code=1", Some("localhost")),
            ("HTTPS://docs.google.com", Some("docs.google.com")),
            ("chrome://settings", None),
            ("file:///Users/me/secret.pdf", None),
            ("about:blank", None),
            ("", None),
            ("https://", None),
        ];
        for (url, expected) in cases {
            assert_eq!(host_from_url(url).as_deref(), expected, "{url}");
        }
    }

    #[test]
    fn browsers_are_recognised_by_whole_words() {
        assert!(is_browser_name("Google Chrome"));
        assert!(is_browser_name("msedge"));
        assert!(!is_browser_name("Archive Utility"));
        assert!(!is_browser_name("Code"));
    }
}
