const COMMANDS: &[&str] = &[
    "get_processes",
    "export_processes_to_csv",
    "get_active_window_title",
    "exchange_oauth_code",
    "refresh_oauth_tokens",
    "save_auth_tokens",
    "load_auth_tokens",
    "clear_auth_tokens",
    "begin_oauth_callback_listener",
    "cancel_oauth_callback_listener",
    "wait_oauth_callback",
];

fn main() {
    tauri_build::try_build(
        tauri_build::Attributes::new()
            .app_manifest(tauri_build::AppManifest::new().commands(COMMANDS)),
    )
    .expect("failed to run tauri-build");
}
