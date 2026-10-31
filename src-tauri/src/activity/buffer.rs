//! Local store for segments until the server has them, so offline time is not lost.

use super::session::Segment;
use rusqlite::{params, Connection, OptionalExtension};

pub const MAX_AGE_MS: i64 = 30 * 24 * 60 * 60 * 1_000;

#[derive(Debug, PartialEq)]
pub struct Row {
    pub id: String,
    pub app_key: String,
    pub app_name: String,
    pub is_browser: bool,
    pub title: String,
    pub domain: Option<String>,
    pub start_ms: i64,
    pub end_ms: i64,
}

#[derive(Debug, PartialEq)]
pub struct IconRow {
    pub app_key: String,
    pub app_name: String,
    pub is_browser: bool,
    pub png: String,
}

pub struct Buffer {
    conn: Connection,
}

impl Buffer {
    pub fn open(conn: Connection) -> rusqlite::Result<Self> {
        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS segments (
                id TEXT PRIMARY KEY,
                sub TEXT NOT NULL,
                app_key TEXT NOT NULL,
                app_name TEXT NOT NULL,
                is_browser INTEGER NOT NULL,
                title TEXT NOT NULL,
                domain TEXT,
                start_ms INTEGER NOT NULL,
                end_ms INTEGER NOT NULL,
                is_open INTEGER NOT NULL
            );
            CREATE INDEX IF NOT EXISTS segments_pending ON segments (sub, is_open, start_ms);
            CREATE TABLE IF NOT EXISTS app_icons (
                sub TEXT NOT NULL,
                app_key TEXT NOT NULL,
                app_name TEXT NOT NULL,
                is_browser INTEGER NOT NULL,
                png TEXT NOT NULL,
                read_ms INTEGER NOT NULL,
                uploaded INTEGER NOT NULL,
                PRIMARY KEY (sub, app_key)
            );
            CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);",
        )?;
        Ok(Self { conn })
    }

    /// Segments still open after a crash or forced quit end at their last checkpoint.
    pub fn recover_open(&self) -> rusqlite::Result<usize> {
        self.conn.execute("UPDATE segments SET is_open = 0 WHERE is_open = 1", [])
    }

    pub fn save(&self, sub: &str, segment: &Segment, is_open: bool) -> rusqlite::Result<()> {
        let w = &segment.window;
        self.conn.execute(
            "INSERT INTO segments
                (id, sub, app_key, app_name, is_browser, title, domain, start_ms, end_ms, is_open)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
             ON CONFLICT(id) DO UPDATE SET end_ms = excluded.end_ms, is_open = excluded.is_open",
            params![
                segment.id,
                sub,
                w.app_key,
                w.app_name,
                w.is_browser,
                w.title,
                w.domain,
                segment.start_ms,
                segment.end_ms,
                is_open
            ],
        )?;
        Ok(())
    }

    pub fn discard(&self, id: &str) -> rusqlite::Result<()> {
        self.conn.execute("DELETE FROM segments WHERE id = ?1", [id])?;
        Ok(())
    }

    /// Oldest first, and only this user's rows: one account never uploads another's activity.
    pub fn pending(&self, sub: &str, limit: usize) -> rusqlite::Result<Vec<Row>> {
        let mut stmt = self.conn.prepare_cached(
            "SELECT id, app_key, app_name, is_browser, title, domain, start_ms, end_ms
             FROM segments WHERE sub = ?1 AND is_open = 0 ORDER BY start_ms LIMIT ?2",
        )?;
        let rows = stmt.query_map(params![sub, limit as i64], |r| {
            Ok(Row {
                id: r.get(0)?,
                app_key: r.get(1)?,
                app_name: r.get(2)?,
                is_browser: r.get(3)?,
                title: r.get(4)?,
                domain: r.get(5)?,
                start_ms: r.get(6)?,
                end_ms: r.get(7)?,
            })
        })?;
        rows.collect()
    }

    pub fn pending_count(&self, sub: &str) -> rusqlite::Result<i64> {
        self.conn.query_row(
            "SELECT COUNT(*) FROM segments WHERE sub = ?1 AND is_open = 0",
            [sub],
            |r| r.get(0),
        )
    }

    pub fn remove(&mut self, ids: &[String]) -> rusqlite::Result<()> {
        let tx = self.conn.transaction()?;
        for id in ids {
            tx.execute("DELETE FROM segments WHERE id = ?1", [id])?;
        }
        tx.commit()
    }

    pub fn purge_user(&self, sub: &str) -> rusqlite::Result<()> {
        self.conn.execute("DELETE FROM segments WHERE sub = ?1", [sub])?;
        self.conn.execute("DELETE FROM app_icons WHERE sub = ?1", [sub])?;
        Ok(())
    }

    pub fn purge_all(&self) -> rusqlite::Result<()> {
        self.conn.execute_batch("DELETE FROM segments; DELETE FROM app_icons;")
    }

    pub fn icon_read_ms(&self, sub: &str, app_key: &str) -> rusqlite::Result<Option<i64>> {
        self.conn
            .query_row(
                "SELECT read_ms FROM app_icons WHERE sub = ?1 AND app_key = ?2",
                [sub, app_key],
                |r| r.get(0),
            )
            .optional()
    }

    /// An unchanged icon only updates its read time, so it is not uploaded again.
    pub fn save_icon(&self, sub: &str, icon: &IconRow, now_ms: i64) -> rusqlite::Result<()> {
        self.conn.execute(
            "INSERT INTO app_icons (sub, app_key, app_name, is_browser, png, read_ms, uploaded)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, 0)
             ON CONFLICT(sub, app_key) DO UPDATE SET
                read_ms = excluded.read_ms,
                uploaded = CASE WHEN png = excluded.png THEN uploaded ELSE 0 END,
                png = excluded.png",
            params![sub, icon.app_key, icon.app_name, icon.is_browser, icon.png, now_ms],
        )?;
        Ok(())
    }

    pub fn pending_icons(&self, sub: &str, limit: usize) -> rusqlite::Result<Vec<IconRow>> {
        let mut stmt = self.conn.prepare_cached(
            "SELECT app_key, app_name, is_browser, png FROM app_icons
             WHERE sub = ?1 AND uploaded = 0 LIMIT ?2",
        )?;
        let rows = stmt.query_map(params![sub, limit as i64], |r| {
            Ok(IconRow {
                app_key: r.get(0)?,
                app_name: r.get(1)?,
                is_browser: r.get(2)?,
                png: r.get(3)?,
            })
        })?;
        rows.collect()
    }

    pub fn mark_icons_uploaded(&self, sub: &str, icons: &[IconRow]) -> rusqlite::Result<()> {
        for icon in icons {
            self.conn.execute(
                "UPDATE app_icons SET uploaded = 1 WHERE sub = ?1 AND app_key = ?2 AND png = ?3",
                [sub, &icon.app_key, &icon.png],
            )?;
        }
        Ok(())
    }

    pub fn prune(&self, now_ms: i64) -> rusqlite::Result<usize> {
        self.conn.execute("DELETE FROM segments WHERE start_ms < ?1", [now_ms - MAX_AGE_MS])
    }

    /// Survives a relaunch, so a pause can't end early just because the app restarted.
    pub fn paused_until_ms(&self) -> i64 {
        self.conn
            .query_row("SELECT value FROM meta WHERE key = 'paused_until_ms'", [], |r| {
                r.get::<_, String>(0)
            })
            .ok()
            .and_then(|value| value.parse().ok())
            .unwrap_or(0)
    }

    pub fn set_paused_until_ms(&self, until_ms: i64) -> rusqlite::Result<()> {
        self.conn.execute(
            "INSERT INTO meta (key, value) VALUES ('paused_until_ms', ?1)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            [until_ms.to_string()],
        )?;
        Ok(())
    }

    pub fn device_id(&self, generate: impl FnOnce() -> String) -> rusqlite::Result<String> {
        let existing: Option<String> = self
            .conn
            .query_row("SELECT value FROM meta WHERE key = 'device_id'", [], |r| r.get(0))
            .ok();
        if let Some(id) = existing {
            return Ok(id);
        }
        let id = generate();
        self.conn.execute("INSERT INTO meta (key, value) VALUES ('device_id', ?1)", [&id])?;
        Ok(id)
    }
}

#[cfg(test)]
mod tests {
    use super::super::session::Window;
    use super::*;

    fn buffer() -> Buffer {
        Buffer::open(Connection::open_in_memory().unwrap()).unwrap()
    }

    fn segment(id: &str, start_ms: i64) -> Segment {
        Segment {
            id: id.into(),
            window: Window {
                app_key: "chrome".into(),
                app_name: "Chrome".into(),
                is_browser: true,
                title: "t".into(),
                domain: Some("github.com".into()),
            },
            start_ms,
            end_ms: start_ms + 5_000,
        }
    }

    #[test]
    fn open_segments_upload_only_after_recovery() {
        let b = buffer();
        b.save("a", &segment("1", 0), true).unwrap();
        assert!(b.pending("a", 10).unwrap().is_empty());
        b.recover_open().unwrap();
        assert_eq!(b.pending("a", 10).unwrap().len(), 1);
    }

    #[test]
    fn checkpoint_then_close_keeps_one_row_with_the_latest_end() {
        let b = buffer();
        let mut s = segment("1", 0);
        b.save("a", &s, true).unwrap();
        s.end_ms = 99_000;
        b.save("a", &s, false).unwrap();
        let rows = b.pending("a", 10).unwrap();
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].end_ms, 99_000);
    }

    #[test]
    fn rows_never_cross_accounts() {
        let b = buffer();
        b.save("a", &segment("1", 0), false).unwrap();
        b.save("b", &segment("2", 0), false).unwrap();
        assert_eq!(b.pending("a", 10).unwrap()[0].id, "1");
        b.purge_user("a").unwrap();
        assert_eq!(b.pending_count("a").unwrap(), 0);
        assert_eq!(b.pending_count("b").unwrap(), 1);
    }

    #[test]
    fn long_offline_backlog_drains_oldest_first_in_batches() {
        let mut b = buffer();
        for i in (0..5).rev() {
            b.save("a", &segment(&i.to_string(), i), false).unwrap();
        }
        let first: Vec<String> = b.pending("a", 2).unwrap().into_iter().map(|r| r.id).collect();
        assert_eq!(first, vec!["0", "1"]);
        b.remove(&first).unwrap();
        assert_eq!(b.pending("a", 2).unwrap()[0].id, "2");
    }

    #[test]
    fn prune_drops_only_rows_past_the_cap() {
        let b = buffer();
        let now = MAX_AGE_MS + 1_000;
        b.save("a", &segment("old", 0), false).unwrap();
        b.save("a", &segment("new", now), false).unwrap();
        assert_eq!(b.prune(now).unwrap(), 1);
        assert_eq!(b.pending("a", 10).unwrap()[0].id, "new");
    }

    fn icon(png: &str) -> IconRow {
        IconRow { app_key: "cursor".into(), app_name: "Cursor".into(), is_browser: false, png: png.into() }
    }

    #[test]
    fn icon_uploads_once_and_again_only_if_it_changes() {
        let b = buffer();
        b.save_icon("a", &icon("one"), 1).unwrap();
        let pending = b.pending_icons("a", 10).unwrap();
        assert_eq!(pending, vec![icon("one")]);
        b.mark_icons_uploaded("a", &pending).unwrap();

        b.save_icon("a", &icon("one"), 2).unwrap();
        assert!(b.pending_icons("a", 10).unwrap().is_empty());
        assert_eq!(b.icon_read_ms("a", "cursor").unwrap(), Some(2));

        b.save_icon("a", &icon("two"), 3).unwrap();
        assert_eq!(b.pending_icons("a", 10).unwrap(), vec![icon("two")]);
    }

    #[test]
    fn icons_are_purged_and_never_cross_accounts() {
        let b = buffer();
        b.save_icon("a", &icon("one"), 1).unwrap();
        assert!(b.pending_icons("b", 10).unwrap().is_empty());
        assert_eq!(b.icon_read_ms("b", "cursor").unwrap(), None);
        b.purge_user("a").unwrap();
        assert!(b.pending_icons("a", 10).unwrap().is_empty());
    }

    #[test]
    fn pause_is_remembered_and_can_be_cleared() {
        let b = buffer();
        assert_eq!(b.paused_until_ms(), 0);
        b.set_paused_until_ms(5_000).unwrap();
        assert_eq!(b.paused_until_ms(), 5_000);
        b.set_paused_until_ms(0).unwrap();
        assert_eq!(b.paused_until_ms(), 0);
    }

    #[test]
    fn device_id_is_stable() {
        let b = buffer();
        assert_eq!(b.device_id(|| "x".into()).unwrap(), "x");
        assert_eq!(b.device_id(|| "y".into()).unwrap(), "x");
    }
}
