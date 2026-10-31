use std::io::{Read, Write};
use std::net::{SocketAddr, TcpListener};
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};

const TOKEN_FILE_NAME: &str = "auth-tokens.json";
pub const OAUTH_CALLBACK_PORT: u16 = 9473;

static OAUTH_LISTENER: Mutex<Option<TcpListener>> = Mutex::new(None);
static TOKEN_FILE: OnceLock<PathBuf> = OnceLock::new();

#[derive(serde::Serialize)]
pub struct OAuthCallbackResult {
    pub code: String,
}

#[derive(serde::Deserialize)]
struct KeycloakTokenResponse {
    access_token: String,
    refresh_token: Option<String>,
    id_token: Option<String>,
    expires_in: u64,
}

fn post_form(token_url: &str, body: &str) -> Result<String, String> {
    eprintln!(
        "[focusanalyze-desktop] POST {token_url} body_len={} thread={:?}",
        body.len(),
        std::thread::current().id()
    );

    // ureq treats any non-2xx response as `Err(ureq::Error::Status(..))`, not a normal
    // `Response` — reading `.status()`/`.into_string()` off the Ok path (as this used to)
    // never sees the actual failure body, which is exactly what explains a Keycloak 500.
    // ureq's default agent has no connect/read timeout, so a stale pooled connection
    // (or a partial/never-completing response) hangs the request forever — exactly what
    // made this look like a stuck "500" instead of a fast, diagnosable error.
    let outcome = ureq::post(token_url)
        .set("Content-Type", "application/x-www-form-urlencoded")
        .timeout(Duration::from_secs(15))
        .send_string(body);

    eprintln!("[focusanalyze-desktop] send_string returned (ok={})", outcome.is_ok());

    match outcome {
        Ok(response) => {
            let text = response
                .into_string()
                .map_err(|e| format!("Failed to read token response: {e}"))?;
            eprintln!("[focusanalyze-desktop] read response body, len={}", text.len());
            Ok(text)
        }
        Err(ureq::Error::Status(code, response)) => {
            let text = response
                .into_string()
                .unwrap_or_else(|_| "<unreadable body>".to_string());
            eprintln!("[focusanalyze-desktop] Keycloak token request failed: {code} - {text}");
            Err(format!("Token exchange failed: {code} - {text}"))
        }
        Err(e) => {
            eprintln!("[focusanalyze-desktop] Token request transport error: {e}");
            Err(format!("Token request failed: {e}"))
        }
    }
}

#[tauri::command]
pub fn exchange_oauth_code(
    code: String,
    code_verifier: String,
    token_url: String,
    client_id: String,
    redirect_uri: String,
) -> Result<String, String> {
    let body = format!(
        "grant_type=authorization_code&client_id={}&code={}&redirect_uri={}&code_verifier={}",
        urlencoding::encode(&client_id),
        urlencoding::encode(&code),
        urlencoding::encode(&redirect_uri),
        urlencoding::encode(&code_verifier),
    );

    let text = post_form(&token_url, &body)?;
    let tokens: KeycloakTokenResponse =
        serde_json::from_str(&text).map_err(|e| format!("Invalid token JSON: {e}"))?;

    if tokens.refresh_token.is_none() {
        return Err(
            "Keycloak did not return a refresh token (offline_access scope may be missing)"
                .to_string(),
        );
    }

    let payload = serde_json::json!({
        "accessToken": tokens.access_token,
        "refreshToken": tokens.refresh_token,
        "idToken": tokens.id_token,
        "expiresIn": tokens.expires_in,
        "expiresAt": std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_millis() as u64 + tokens.expires_in * 1000)
            .unwrap_or(0),
    });

    serde_json::to_string(&payload).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn refresh_oauth_tokens(
    refresh_token: String,
    token_url: String,
    client_id: String,
) -> Result<String, String> {
    let body = format!(
        "grant_type=refresh_token&client_id={}&refresh_token={}",
        urlencoding::encode(&client_id),
        urlencoding::encode(&refresh_token),
    );

    let text = post_form(&token_url, &body)?;
    let tokens: KeycloakTokenResponse =
        serde_json::from_str(&text).map_err(|e| format!("Invalid token JSON: {e}"))?;

    let refresh_token = tokens
        .refresh_token
        .unwrap_or(refresh_token);

    let payload = serde_json::json!({
        "accessToken": tokens.access_token,
        "refreshToken": refresh_token,
        "idToken": tokens.id_token,
        "expiresIn": tokens.expires_in,
        "expiresAt": std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_millis() as u64 + tokens.expires_in * 1000)
            .unwrap_or(0),
    });

    serde_json::to_string(&payload).map_err(|e| e.to_string())
}

/// Tokens live in a file only this OS user can read, not the OS keychain: an unsigned app has
/// no stable identity, so macOS would prompt for the login password again on every update.
/// Call once from `setup()`, before anything reads tokens.
pub fn init_token_store(app_data_dir: PathBuf) {
    let _ = TOKEN_FILE.set(app_data_dir.join(TOKEN_FILE_NAME));
}

fn token_file() -> Result<&'static PathBuf, String> {
    TOKEN_FILE
        .get()
        .ok_or_else(|| "Token store is not initialized".to_string())
}

fn restrict_permissions(path: &Path, mode: u32) -> std::io::Result<()> {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(path, std::fs::Permissions::from_mode(mode))?;
    }
    #[cfg(not(unix))]
    let _ = (path, mode); // %APPDATA% is already private to the user.
    Ok(())
}

/// Atomic, so a crash or another window's concurrent read never sees a partial file.
fn write_token_file(path: &Path, json: &str) -> Result<(), String> {
    let dir = path.parent().ok_or_else(|| "Invalid token path".to_string())?;
    std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    restrict_permissions(dir, 0o700).map_err(|e| e.to_string())?;

    let unique = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or_default();
    let temp = dir.join(format!("{TOKEN_FILE_NAME}.{}.{unique}.tmp", std::process::id()));
    let result = (|| {
        std::fs::write(&temp, "")?;
        restrict_permissions(&temp, 0o600)?;
        std::fs::write(&temp, json)?;
        std::fs::rename(&temp, path)
    })();
    if result.is_err() {
        let _ = std::fs::remove_file(&temp);
    }
    result.map_err(|e| e.to_string())
}

fn read_token_file(path: &Path) -> Result<Option<String>, String> {
    match std::fs::read_to_string(path) {
        Ok(value) => Ok(Some(value)),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

fn delete_token_file(path: &Path) -> Result<(), String> {
    match std::fs::remove_file(path) {
        Ok(()) => Ok(()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
pub fn save_auth_tokens(json: String) -> Result<(), String> {
    write_token_file(token_file()?, &json)
}

#[tauri::command]
pub fn load_auth_tokens() -> Result<Option<String>, String> {
    read_token_file(token_file()?)
}

#[tauri::command]
pub fn clear_auth_tokens() -> Result<(), String> {
    delete_token_file(token_file()?)
}

#[tauri::command]
pub fn begin_oauth_callback_listener() -> Result<u16, String> {
    let addr = SocketAddr::from(([127, 0, 0, 1], OAUTH_CALLBACK_PORT));
    let listener = TcpListener::bind(addr).map_err(|e| {
        format!(
            "Could not bind OAuth callback listener on 127.0.0.1:{OAUTH_CALLBACK_PORT}: {e}"
        )
    })?;
    listener
        .set_nonblocking(true)
        .map_err(|e| e.to_string())?;

    let mut guard = OAUTH_LISTENER
        .lock()
        .map_err(|_| "OAuth listener lock poisoned".to_string())?;
    *guard = Some(listener);
    Ok(OAUTH_CALLBACK_PORT)
}

#[tauri::command]
pub fn cancel_oauth_callback_listener() -> Result<(), String> {
    let mut guard = OAUTH_LISTENER
        .lock()
        .map_err(|_| "OAuth listener lock poisoned".to_string())?;
    *guard = None;
    Ok(())
}

#[tauri::command]
pub async fn wait_oauth_callback(
    app: tauri::AppHandle,
    expected_state: String,
) -> Result<OAuthCallbackResult, String> {
    let result =
        tauri::async_runtime::spawn_blocking(move || listen_for_oauth_callback(expected_state))
            .await
            .map_err(|e| e.to_string())??;
    // The login finished in the browser, so bring the app back in front of it.
    crate::show_main_window(&app);
    Ok(result)
}

fn listen_for_oauth_callback(expected_state: String) -> Result<OAuthCallbackResult, String> {
    let listener = {
        let mut guard = OAUTH_LISTENER
            .lock()
            .map_err(|_| "OAuth listener lock poisoned".to_string())?;
        guard
            .take()
            .ok_or_else(|| "OAuth callback listener is not active".to_string())?
    };

    let deadline = Instant::now() + Duration::from_secs(300);

    loop {
        if Instant::now() >= deadline {
            return Err("OAuth sign-in timed out after 5 minutes".to_string());
        }

        match listener.accept() {
            Ok((mut stream, addr)) => {
                let result = handle_oauth_request(&mut stream, &expected_state);
                let success = result.is_ok();
                if let Err(ref e) = result {
                    eprintln!("[focusanalyze-desktop] loopback connection from {addr}: {e}");
                }
                let _ = write_oauth_response(&mut stream, success);
                if success {
                    return result;
                }
                // Browsers may hit the loopback port with favicon/prefetch requests
                // before the real OAuth redirect — keep listening until we get a code.
            }
            Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => {
                std::thread::sleep(Duration::from_millis(100));
            }
            Err(error) => return Err(error.to_string()),
        }
    }
}

fn handle_oauth_request(
    stream: &mut std::net::TcpStream,
    expected_state: &str,
) -> Result<OAuthCallbackResult, String> {
    let mut buffer = [0_u8; 4096];
    let read = stream.read(&mut buffer).map_err(|e| e.to_string())?;
    if read == 0 {
        return Err("OAuth callback connection closed before data was received".to_string());
    }

    let request = String::from_utf8_lossy(&buffer[..read]);
    let request_line = request
        .lines()
        .next()
        .ok_or_else(|| "OAuth callback request was empty".to_string())?;

    let path = request_line
        .split_whitespace()
        .nth(1)
        .ok_or_else(|| "OAuth callback request was malformed".to_string())?;

    if !path.starts_with("/callback") {
        return Err("Ignoring non-callback request".to_string());
    }

    let query = path
        .split_once('?')
        .map(|(_, query)| query)
        .unwrap_or_default();

    let params = parse_query(query);

    if let Some(error) = params.get("error") {
        let description = params
            .get("error_description")
            .map(String::as_str)
            .unwrap_or("Unknown OAuth error");
        return Err(format!("OAuth error: {error} - {description}"));
    }

    let returned_state = params
        .get("state")
        .ok_or_else(|| "OAuth callback did not include state".to_string())?;
    if returned_state != expected_state {
        return Err("OAuth state mismatch — possible CSRF attack".to_string());
    }

    let code = params
        .get("code")
        .ok_or_else(|| "OAuth callback did not include authorization code".to_string())?
        .clone();

    Ok(OAuthCallbackResult { code })
}

macro_rules! oauth_callback_style {
    () => {
        r#"
    :root { color-scheme: dark; }
    * { box-sizing: border-box; }
    html, body {
      height: 100%;
      margin: 0;
      background: #0a0a0a;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
      color: #f5f5f5;
    }
    body {
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
    }
    .card {
      max-width: 380px;
      width: 100%;
      text-align: center;
      padding: 40px 32px;
      border-radius: 16px;
      background: #141414;
      border: 1px solid rgba(255, 255, 255, 0.08);
    }
    .icon {
      width: 56px;
      height: 56px;
      margin: 0 auto 20px;
      border-radius: 999px;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .icon.success { background: rgba(52, 199, 89, 0.15); }
    .icon.failure { background: rgba(255, 69, 58, 0.15); }
    h1 { font-size: 18px; font-weight: 600; margin: 0 0 8px; }
    p { font-size: 14px; line-height: 1.5; color: #9a9a9a; margin: 0; }
"#
    };
}

const OAUTH_CALLBACK_SUCCESS_HTML: &str = concat!(
    "<!doctype html><html><head><meta charset=\"utf-8\"><title>FocusAnalyze</title><style>",
    oauth_callback_style!(),
    "</style></head><body><div class=\"card\"><div class=\"icon success\"><svg width=\"28\" height=\"28\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"#34c759\" stroke-width=\"2.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><polyline points=\"20 6 9 17 4 12\"></polyline></svg></div><h1>Signed in to FocusAnalyze</h1><p>You can close this tab and return to the desktop app.</p></div><script>setTimeout(function(){ window.close(); }, 1200);</script></body></html>"
);

const OAUTH_CALLBACK_FAILURE_HTML: &str = concat!(
    "<!doctype html><html><head><meta charset=\"utf-8\"><title>FocusAnalyze</title><style>",
    oauth_callback_style!(),
    "</style></head><body><div class=\"card\"><div class=\"icon failure\"><svg width=\"28\" height=\"28\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"#ff453a\" stroke-width=\"2.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><line x1=\"18\" y1=\"6\" x2=\"6\" y2=\"18\"></line><line x1=\"6\" y1=\"6\" x2=\"18\" y2=\"18\"></line></svg></div><h1>Sign-in didn't complete</h1><p>Return to FocusAnalyze Desktop and try again.</p></div></body></html>"
);

fn write_oauth_response(stream: &mut std::net::TcpStream, success: bool) -> Result<(), String> {
    let body = if success {
        OAUTH_CALLBACK_SUCCESS_HTML
    } else {
        OAUTH_CALLBACK_FAILURE_HTML
    };

    let response = format!(
        "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
        body.len(),
        body
    );

    stream
        .write_all(response.as_bytes())
        .map_err(|e| e.to_string())?;
    stream.flush().map_err(|e| e.to_string())
}

fn parse_query(query: &str) -> std::collections::HashMap<String, String> {
    query
        .split('&')
        .filter_map(|pair| {
            let mut parts = pair.splitn(2, '=');
            let key = parts.next()?.to_string();
            let value = urlencoding::decode(parts.next().unwrap_or_default())
                .map(|decoded| decoded.into_owned())
                .unwrap_or_default();
            Some((key, value))
        })
        .collect()
}

#[cfg(test)]
mod token_store_tests {
    use super::*;

    fn temp_token_path(name: &str) -> PathBuf {
        std::env::temp_dir()
            .join(format!("fa-token-test-{name}-{}", std::process::id()))
            .join(TOKEN_FILE_NAME)
    }

    #[test]
    fn saves_overwrites_loads_and_clears() {
        let path = temp_token_path("roundtrip");
        assert_eq!(read_token_file(&path).unwrap(), None);
        write_token_file(&path, "first").unwrap();
        write_token_file(&path, "second").unwrap();
        assert_eq!(read_token_file(&path).unwrap().as_deref(), Some("second"));
        delete_token_file(&path).unwrap();
        delete_token_file(&path).unwrap();
        assert_eq!(read_token_file(&path).unwrap(), None);
        let dir = path.parent().unwrap();
        assert_eq!(std::fs::read_dir(dir).unwrap().count(), 0, "no temp files left behind");
        std::fs::remove_dir(dir).unwrap();
    }

    #[cfg(unix)]
    #[test]
    fn file_is_private_to_the_user() {
        use std::os::unix::fs::PermissionsExt;
        let path = temp_token_path("perms");
        write_token_file(&path, "secret").unwrap();
        let mode = std::fs::metadata(&path).unwrap().permissions().mode() & 0o777;
        assert_eq!(mode, 0o600);
        let dir = path.parent().unwrap();
        let dir_mode = std::fs::metadata(dir).unwrap().permissions().mode() & 0o777;
        assert_eq!(dir_mode, 0o700);
        std::fs::remove_file(&path).unwrap();
        std::fs::remove_dir(dir).unwrap();
    }
}
