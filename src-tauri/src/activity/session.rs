//! Turns window samples into finished segments. Pure and clock-free so it can be unit-tested.

pub const MIN_SEGMENT_MS: i64 = 3_000;
pub const MAX_SEGMENT_MS: i64 = 15 * 60 * 1_000;
pub const IDLE_THRESHOLD_MS: i64 = 5 * 60 * 1_000;
/// Longer than this between ticks means the machine slept or the process was suspended.
pub const TICK_GAP_MS: i64 = 30_000;
pub const CHECKPOINT_MS: i64 = 30_000;

#[derive(Clone, Debug, PartialEq)]
pub struct Window {
    pub app_key: String,
    pub app_name: String,
    pub is_browser: bool,
    pub title: String,
    pub domain: Option<String>,
}

#[derive(Clone, Debug, PartialEq)]
pub struct Segment {
    pub id: String,
    pub window: Window,
    pub start_ms: i64,
    pub end_ms: i64,
}

#[derive(Clone, Debug, PartialEq)]
pub enum Action {
    /// Save the running segment so a crash loses at most one checkpoint interval.
    Checkpoint(Segment),
    /// The segment is finished and can be uploaded.
    Close(Segment),
    /// The segment was too short to be worth keeping.
    Discard(String),
}

pub struct Tracker {
    current: Option<Segment>,
    last_tick_ms: Option<i64>,
    last_checkpoint_ms: i64,
    new_id: Box<dyn FnMut() -> String + Send>,
}

impl Tracker {
    pub fn new(new_id: Box<dyn FnMut() -> String + Send>) -> Self {
        Self { current: None, last_tick_ms: None, last_checkpoint_ms: 0, new_id }
    }

    /// The website is expensive to read (on macOS it spawns osascript), so it is only read when
    /// the window changes. Returns the known value when this window is the running one.
    pub fn known_domain(&self, app_key: &str, title: &str) -> Option<Option<String>> {
        self.current
            .as_ref()
            .filter(|s| s.window.app_key == app_key && s.window.title == title)
            .map(|s| s.window.domain.clone())
    }

    pub fn tick(&mut self, now_ms: i64, idle_ms: i64, window: Option<Window>) -> Vec<Action> {
        let mut actions = Vec::new();

        if let Some(last) = self.last_tick_ms {
            if now_ms - last > TICK_GAP_MS || now_ms < last {
                self.finish(last, &mut actions);
            }
        }
        self.last_tick_ms = Some(now_ms);

        if idle_ms >= IDLE_THRESHOLD_MS {
            self.finish(now_ms - idle_ms, &mut actions);
            return actions;
        }

        let Some(window) = window else {
            self.finish(now_ms, &mut actions);
            return actions;
        };

        let same_window = self.current.as_ref().is_some_and(|s| {
            s.window.app_key == window.app_key && s.window.title == window.title
        });
        if !same_window {
            self.finish(now_ms, &mut actions);
        } else if self.current.as_ref().is_some_and(|s| now_ms - s.start_ms >= MAX_SEGMENT_MS) {
            self.finish(now_ms, &mut actions);
        }

        match self.current.as_mut() {
            Some(segment) => {
                segment.end_ms = now_ms;
                if now_ms - self.last_checkpoint_ms >= CHECKPOINT_MS {
                    self.last_checkpoint_ms = now_ms;
                    actions.push(Action::Checkpoint(segment.clone()));
                }
            }
            None => {
                let segment =
                    Segment { id: (self.new_id)(), window, start_ms: now_ms, end_ms: now_ms };
                self.last_checkpoint_ms = now_ms;
                self.current = Some(segment);
            }
        }
        actions
    }

    /// Ends the running segment, for pause, stop, sign-out or quit.
    pub fn flush(&mut self, now_ms: i64) -> Vec<Action> {
        let mut actions = Vec::new();
        self.finish(now_ms, &mut actions);
        self.last_tick_ms = None;
        actions
    }

    fn finish(&mut self, end_ms: i64, actions: &mut Vec<Action>) {
        let Some(mut segment) = self.current.take() else { return };
        segment.end_ms = end_ms;
        if segment.end_ms - segment.start_ms < MIN_SEGMENT_MS {
            actions.push(Action::Discard(segment.id));
        } else {
            actions.push(Action::Close(segment));
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn window(title: &str) -> Window {
        Window {
            app_key: "chrome".into(),
            app_name: "Chrome".into(),
            is_browser: true,
            title: title.into(),
            domain: Some("github.com".into()),
        }
    }

    fn tracker() -> Tracker {
        let mut n = 0;
        Tracker::new(Box::new(move || {
            n += 1;
            format!("id{n}")
        }))
    }

    fn closed(actions: &[Action]) -> Vec<(i64, i64)> {
        actions
            .iter()
            .filter_map(|a| match a {
                Action::Close(s) => Some((s.start_ms, s.end_ms)),
                _ => None,
            })
            .collect()
    }

    #[test]
    fn window_change_closes_and_starts_a_new_segment() {
        let mut t = tracker();
        t.tick(0, 0, Some(window("a")));
        assert_eq!(closed(&t.tick(10_000, 0, Some(window("b")))), vec![(0, 10_000)]);
        assert_eq!(closed(&t.flush(20_000)), vec![(10_000, 20_000)]);
    }

    #[test]
    fn very_short_segments_are_discarded() {
        let mut t = tracker();
        t.tick(0, 0, Some(window("a")));
        let actions = t.tick(2_000, 0, Some(window("b")));
        assert_eq!(actions, vec![Action::Discard("id1".into())]);
    }

    #[test]
    fn long_sessions_split_at_the_cap_without_losing_time() {
        let mut t = tracker();
        let mut all = Vec::new();
        let mut now = 0;
        while now <= 40 * 60 * 1_000 {
            all.extend(closed(&t.tick(now, 0, Some(window("a")))));
            now += 2_000;
        }
        all.extend(closed(&t.flush(now - 2_000)));
        assert_eq!(all.len(), 3);
        assert_eq!(all[0].0, 0);
        assert_eq!(all[0].1, all[1].0);
        assert_eq!(all[1].1, all[2].0);
        assert_eq!(all[2].1, 40 * 60 * 1_000);
    }

    #[test]
    fn split_segments_get_new_ids() {
        let mut t = tracker();
        t.tick(0, 0, Some(window("a")));
        t.tick(MAX_SEGMENT_MS, 0, Some(window("a")));
        match t.flush(MAX_SEGMENT_MS + 10_000).as_slice() {
            [Action::Close(s)] => assert_eq!(s.id, "id2"),
            other => panic!("{other:?}"),
        }
    }

    #[test]
    fn idle_ends_the_segment_when_input_stopped() {
        let mut t = tracker();
        t.tick(0, 0, Some(window("a")));
        let mut now = 0;
        let last_input = 60_000;
        let mut all = Vec::new();
        while now <= last_input + IDLE_THRESHOLD_MS + 4_000 {
            now += 2_000;
            let idle = (now - last_input).max(0);
            all.extend(closed(&t.tick(now, idle, Some(window("a")))));
        }
        assert_eq!(all, vec![(0, last_input)]);
        assert!(t.tick(now + 2_000, now + 2_000 - last_input, Some(window("a"))).is_empty());
    }

    #[test]
    fn sleep_ends_the_segment_at_the_last_tick() {
        let mut t = tracker();
        t.tick(0, 0, Some(window("a")));
        t.tick(10_000, 0, Some(window("a")));
        let actions = t.tick(10_000 + TICK_GAP_MS + 1, 0, Some(window("a")));
        assert_eq!(closed(&actions), vec![(0, 10_000)]);
    }

    #[test]
    fn clock_moving_backwards_closes_cleanly() {
        let mut t = tracker();
        t.tick(100_000, 0, Some(window("a")));
        t.tick(110_000, 0, Some(window("a")));
        let actions = t.tick(50_000, 0, Some(window("a")));
        assert_eq!(closed(&actions), vec![(100_000, 110_000)]);
    }

    #[test]
    fn checkpoints_are_written_on_an_interval() {
        let mut t = tracker();
        t.tick(0, 0, Some(window("a")));
        assert!(t.tick(2_000, 0, Some(window("a"))).is_empty());
        assert!(matches!(
            t.tick(CHECKPOINT_MS, 0, Some(window("a"))).as_slice(),
            [Action::Checkpoint(_)]
        ));
    }

    #[test]
    fn no_focused_window_ends_the_segment() {
        let mut t = tracker();
        t.tick(0, 0, Some(window("a")));
        assert_eq!(closed(&t.tick(5_000, 0, None)), vec![(0, 5_000)]);
    }

    #[test]
    fn domain_is_reused_only_for_the_running_window() {
        let mut t = tracker();
        assert_eq!(t.known_domain("chrome", "a"), None);
        t.tick(0, 0, Some(window("a")));
        assert_eq!(t.known_domain("chrome", "a"), Some(Some("github.com".into())));
        assert_eq!(t.known_domain("chrome", "b"), None);
    }
}
