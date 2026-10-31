//! Uploads buffered segments in batches. Rust only reads the access token: the web app stays the
//! single refresher, so two refreshers can never race on a rotating refresh token.

use super::buffer::{IconRow, Row};
use base64::Engine;
use chrono::{SecondsFormat, TimeZone, Utc};
use serde_json::{json, Value};
use std::time::Duration;

pub const BATCH_SIZE: usize = 500;
pub const BASE_INTERVAL_MS: i64 = 5 * 60 * 1_000;
pub const MAX_BACKOFF_MS: i64 = 60 * 60 * 1_000;

#[derive(Debug, PartialEq)]
pub enum Outcome {
    /// The server has these for good, including records it rejected as permanently invalid.
    Delivered,
    /// The token expired. Keep everything; the web app will refresh it.
    Unauthorized,
    /// The user turned tracking off on some device: stop and clear the buffer.
    TrackingDisabled,
    /// The network or server failed. Keep everything and back off.
    Retry(String),
}

pub fn classify(status: u16, body: &str) -> Outcome {
    match status {
        200..=299 => Outcome::Delivered,
        401 => Outcome::Unauthorized,
        409 if body.contains("tracking_disabled") => Outcome::TrackingDisabled,
        _ => Outcome::Retry(format!("server returned {status}")),
    }
}

pub fn next_backoff(current_ms: i64) -> i64 {
    (current_ms * 2).clamp(BASE_INTERVAL_MS, MAX_BACKOFF_MS)
}

/// The account that owns the session, read from the access token's payload. The token is only
/// used as an identity hint here; the server still verifies it on upload.
pub fn subject_of(access_token: &str) -> Option<String> {
    let payload = access_token.split('.').nth(1)?;
    let bytes = base64::engine::general_purpose::URL_SAFE_NO_PAD.decode(payload).ok()?;
    let claims: Value = serde_json::from_slice(&bytes).ok()?;
    claims.get("sub")?.as_str().map(str::to_owned)
}

pub fn access_token_from(stored: &str) -> Option<String> {
    let tokens: Value = serde_json::from_str(stored).ok()?;
    tokens.get("accessToken")?.as_str().map(str::to_owned)
}

fn rfc3339(ms: i64) -> String {
    Utc.timestamp_millis_opt(ms)
        .single()
        .unwrap_or_default()
        .to_rfc3339_opts(SecondsFormat::Millis, true)
}

pub fn payload(device_id: &str, rows: &[Row]) -> Value {
    let records: Vec<Value> = rows
        .iter()
        .map(|r| {
            json!({
                "client_session_id": r.id,
                "application_name": r.app_key,
                "name": r.app_name,
                "os": std::env::consts::OS,
                "is_browser": r.is_browser,
                "window_title": r.title,
                "domain": r.domain,
                "start_time": rfc3339(r.start_ms),
                "end_time": rfc3339(r.end_ms),
            })
        })
        .collect();
    json!({ "device_id": device_id, "records": records })
}

pub fn icons_payload(icons: &[IconRow]) -> Value {
    let icons: Vec<Value> = icons
        .iter()
        .map(|i| {
            json!({
                "application_name": i.app_key,
                "name": i.app_name,
                "os": std::env::consts::OS,
                "is_browser": i.is_browser,
                "icon_png": i.png,
            })
        })
        .collect();
    json!({ "icons": icons })
}

pub const SEGMENTS_PATH: &str = "/api/system_activity/bulk-create-system-activity/";
pub const ICONS_PATH: &str = "/api/system_activity/app-icons/";

pub fn send(api_base: &str, path: &str, access_token: &str, body: &Value) -> Outcome {
    let url = format!("{}{path}", api_base.trim_end_matches('/'));
    let result = ureq::post(&url)
        .timeout(Duration::from_secs(60))
        .set("Authorization", &format!("Bearer {access_token}"))
        .send_json(body);
    match result {
        Ok(response) => classify(response.status(), ""),
        Err(ureq::Error::Status(code, response)) => {
            classify(code, &response.into_string().unwrap_or_default())
        }
        Err(e) => Outcome::Retry(e.kind().to_string()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn classify_keeps_data_unless_the_server_took_it() {
        assert_eq!(classify(200, ""), Outcome::Delivered);
        assert_eq!(classify(401, ""), Outcome::Unauthorized);
        assert_eq!(classify(409, r#"{"error":"tracking_disabled"}"#), Outcome::TrackingDisabled);
        assert!(matches!(classify(409, "other"), Outcome::Retry(_)));
        assert!(matches!(classify(400, ""), Outcome::Retry(_)));
        assert!(matches!(classify(503, ""), Outcome::Retry(_)));
    }

    #[test]
    fn backoff_doubles_to_a_cap() {
        assert_eq!(next_backoff(BASE_INTERVAL_MS), BASE_INTERVAL_MS * 2);
        assert_eq!(next_backoff(MAX_BACKOFF_MS), MAX_BACKOFF_MS);
    }

    #[test]
    fn subject_is_read_from_the_token_payload() {
        let payload = base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(r#"{"sub":"u1"}"#);
        assert_eq!(subject_of(&format!("h.{payload}.s")), Some("u1".to_string()));
        assert_eq!(subject_of("garbage"), None);
    }

    #[test]
    fn payload_uses_utc_timestamps_the_server_accepts() {
        let row = Row {
            id: "1".into(),
            app_key: "chrome".into(),
            app_name: "Chrome".into(),
            is_browser: true,
            title: "t".into(),
            domain: None,
            start_ms: 0,
            end_ms: 1_500,
        };
        let body = payload("d", &[row]);
        assert_eq!(body["records"][0]["start_time"], "1970-01-01T00:00:00.000Z");
        assert_eq!(body["records"][0]["end_time"], "1970-01-01T00:00:01.500Z");
    }
}
