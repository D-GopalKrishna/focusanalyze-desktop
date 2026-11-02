use tauri::AppHandle;
use tiny_http::{Header, Response as HttpResponse, Server};

/// A path segment in a known dynamic route: either a literal, or a stand-in for the
/// unbounded DB-assigned id that `generateStaticParams()` only pre-rendered one file for
/// (the literal string `"placeholder"` — see the `generateStaticParams` comments across
/// `focusanalyze-fe/app/(auth)/(dashboard)/**`).
enum Segment {
    Fixed(&'static str),
    /// The name is the Next.js param (`[project_id]` -> `"project_id"`), which is how the id
    /// is keyed inside the exported route data — see `substitute_real_ids`.
    Id(&'static str),
}

/// Every dynamic-ID route the FE build pre-renders as a single `.../placeholder/...` file.
/// Keep in sync with the `generateStaticParams()` calls in focusanalyze-fe — anything new
/// there needs a matching template here, or a real click into that page will 500 exactly
/// like the `/dashboard/projects/focusanalyze/<real-id>` bug this file fixes.
const ROUTE_TEMPLATES: &[&[Segment]] = &[
    &[Segment::Fixed("dashboard"), Segment::Fixed("focus-sessions"), Segment::Fixed("session"), Segment::Id("id")],
    &[Segment::Fixed("dashboard"), Segment::Fixed("focus-sessions"), Segment::Fixed("invite"), Segment::Id("token")],
    &[Segment::Fixed("dashboard"), Segment::Fixed("admin"), Segment::Fixed("teams"), Segment::Id("teamId")],
    &[Segment::Fixed("dashboard"), Segment::Fixed("admin"), Segment::Fixed("user"), Segment::Id("userid")],
    &[Segment::Fixed("dashboard"), Segment::Fixed("projects"), Segment::Fixed("focusanalyze"), Segment::Id("project_id")],
    &[Segment::Fixed("dashboard"), Segment::Fixed("projects"), Segment::Fixed("focusanalyze"), Segment::Id("project_id"), Segment::Fixed("board")],
    &[Segment::Fixed("dashboard"), Segment::Fixed("projects"), Segment::Fixed("focusanalyze"), Segment::Id("project_id"), Segment::Fixed("calendar")],
    &[Segment::Fixed("dashboard"), Segment::Fixed("projects"), Segment::Fixed("focusanalyze"), Segment::Id("project_id"), Segment::Fixed("list")],
    &[Segment::Fixed("dashboard"), Segment::Fixed("projects"), Segment::Fixed("focusanalyze"), Segment::Id("project_id"), Segment::Fixed("timeline")],
    &[Segment::Fixed("dashboard"), Segment::Fixed("projects"), Segment::Fixed("focusanalyze"), Segment::Id("project_id"), Segment::Fixed("tracks")],
    &[Segment::Fixed("dashboard"), Segment::Fixed("projects"), Segment::Fixed("focusanalyze"), Segment::Id("project_id"), Segment::Fixed("goals")],
    &[Segment::Fixed("dashboard"), Segment::Fixed("projects"), Segment::Fixed("focusanalyze"), Segment::Id("project_id"), Segment::Fixed("releases")],
    &[Segment::Fixed("dashboard"), Segment::Fixed("projects"), Segment::Fixed("focusanalyze"), Segment::Id("project_id"), Segment::Fixed("goals"), Segment::Id("goal_id")],
    &[Segment::Fixed("dashboard"), Segment::Fixed("projects"), Segment::Fixed("focusanalyze"), Segment::Id("project_id"), Segment::Fixed("releases"), Segment::Id("release_id")],
];

/// A real-id request resolved to its on-disk `placeholder` file, plus the ids it stood for.
struct DynamicRewrite {
    path: String,
    ids: Vec<(&'static str, String)>,
}

/// If `path` matches a known dynamic-route template as a prefix, return the equivalent
/// `placeholder`-substituted path (keeping any trailing segments — e.g. Next's RSC payload
/// filename, which encodes the route *shape* not the param value — unchanged) and the real
/// ids it replaced. Content only exists on disk for the literal `placeholder` id, and those
/// bytes name that id inside them, so the caller must also run `substitute_real_ids`.
fn rewrite_dynamic_id_path(path: &str) -> Option<DynamicRewrite> {
    let requested: Vec<&str> = path.trim_start_matches('/').split('/').collect();

    // Longest (most specific) match wins — e.g. the 6-segment "goals/<goal_id>" template
    // must beat the 5-segment "goals" template on a request for a real goal id, since the
    // shorter one also matches as a valid prefix. Without this, whichever template happened
    // to come first in the array wins, silently rewriting to the wrong file.
    let template = ROUTE_TEMPLATES
        .iter()
        .filter(|template| requested.len() >= template.len())
        .filter(|template| {
            template.iter().zip(requested.iter()).all(|(seg, actual)| match seg {
                Segment::Fixed(expected) => expected == actual,
                Segment::Id(_) => !actual.is_empty(),
            })
        })
        .max_by_key(|template| template.len())?;

    let mut rewritten: Vec<String> = Vec::with_capacity(requested.len());
    let mut ids = Vec::new();
    for (i, seg) in template.iter().enumerate() {
        match seg {
            Segment::Fixed(s) => rewritten.push((*s).to_string()),
            Segment::Id(name) => {
                // Client navigation asks for the route's flight data as `<id>.txt`. The
                // extension belongs to the file, not the id — dropping it would serve the
                // HTML page as flight data.
                let (id, extension) = split_route_extension(requested[i]);
                if id == "placeholder" {
                    // Already the placeholder — no rewrite needed, and more importantly no
                    // infinite-loop risk from "rewriting" it to itself.
                    return None;
                }
                ids.push((*name, id.to_string()));
                rewritten.push(format!("placeholder{extension}"));
            }
        }
    }
    rewritten.extend(requested[template.len()..].iter().map(|s| (*s).to_string()));
    Some(DynamicRewrite { path: format!("/{}", rewritten.join("/")), ids })
}

fn split_route_extension(segment: &str) -> (&str, &str) {
    for extension in [".txt", ".html"] {
        if let Some(id) = segment.strip_suffix(extension) {
            return (id, extension);
        }
    }
    (segment, "")
}

/// Ids go into inline scripts, so anything that could break out of a string is refused. Every
/// real id (numeric ids, url-safe invite tokens) fits this.
fn is_safe_id(id: &str) -> bool {
    !id.is_empty() && id.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_')
}

/// Puts the real ids into an exported page or flight payload, doing what a real Next server
/// does when it renders the route for that id.
///
/// `useParams()` does NOT read the browser URL: it reads the router tree, and the tree comes
/// from these bytes. Served as exported, every page sees `project_id: "placeholder"`, which
/// `parseInt` turns into the `/api/project/NaN/board-view/` request behind "Project not found".
///
/// Only the three shapes that carry a param are touched, each anchored on the param's name, so
/// other text containing the word "placeholder" (input attributes, `og:url`) is left alone.
/// HTML holds the same data as an escaped JS string, hence both quote forms.
fn substitute_real_ids(body: &str, ids: &[(&'static str, String)]) -> String {
    let mut result = body.to_string();
    for (name, id) in ids {
        if !is_safe_id(id) {
            continue;
        }
        for q in ["\"", "\\\""] {
            // Router tree: ["project_id","placeholder","d",[]]
            // Page props: "params":{"project_id":"placeholder"}
            // Prefetch tree (`__next._tree.txt`): "name":"project_id","param":{...,"key":"placeholder"
            let shapes = [
                format!("[{q}{name}{q},{q}%{q},{q}d{q}"),
                format!("{q}{name}{q}:{q}%{q}"),
                format!("{q}name{q}:{q}{name}{q},{q}param{q}:{{{q}type{q}:{q}d{q},{q}key{q}:{q}%{q}"),
            ];
            for shape in shapes {
                result = result.replace(&shape.replace('%', "placeholder"), &shape.replace('%', id));
            }
        }
    }
    result
}

fn carries_route_data(mime_type: &str) -> bool {
    mime_type.starts_with("text/html") || mime_type.starts_with("text/plain")
}

/// Serves the FE static export over real `http://` (see `LOCALHOST_PORTS` in `lib.rs` for
/// why) using Tauri's own asset resolver — the same one the `tauri://` protocol and the
/// (now-replaced) `tauri-plugin-localhost` both use, so MIME types/CSP headers stay correct.
/// Unlike that plugin, this adds a fallback for dynamic-ID routes: on an exact-match miss,
/// retry with the id segment(s) rewritten to `placeholder` before giving up, then write the
/// real ids into what comes back (see `substitute_real_ids`).
///
/// Tries each of `candidate_ports` in order and binds the first one that's free — 9843 is an
/// uncommon port so a real clash is unlikely, but not impossible (another local app already
/// using it), and the old single-port version had no recovery from that beyond a hard panic.
/// Every candidate must be in the backend's CORS allowlist and the app's `remote` capability
/// (see capabilities/default.json) since which one actually gets used isn't known until
/// runtime. Blocks until a port binds (or all candidates are exhausted) so the caller can use
/// the real port to build the window; the actual request-serving loop then runs on its own
/// thread.
pub fn spawn(app: AppHandle, host: &str, candidate_ports: &[u16]) -> u16 {
    let asset_resolver = app.asset_resolver();

    let (server, port) = candidate_ports
        .iter()
        .find_map(|&port| Server::http(format!("{host}:{port}")).ok().map(|s| (s, port)))
        .expect("failed to bind local asset server on any candidate port");

    std::thread::spawn(move || {
        for req in server.incoming_requests() {
            let path: String = req
                .url()
                .parse::<http::Uri>()
                .map(|uri| uri.path().to_string())
                .unwrap_or_else(|_| req.url().to_string());

            // Next.js's own `<Link>` prefetching (and any other code that navigates by the
            // plain pretty path, no `.html`) requests e.g. `/dashboard/habits` — this static
            // export only has `dashboard/habits.html` on disk, so that 404s every time even
            // though the page genuinely exists. A real Next.js server normalizes this
            // transparently; this hand-rolled one didn't. Only try it for extension-less
            // paths (no `.` in the last segment) so real asset requests (`.js`, `.css`,
            // `.png`, the route's own `.txt` flight-data payload, …) aren't affected.
            let html_fallback_path = |p: &str| {
                let last_segment = p.rsplit('/').next().unwrap_or("");
                if last_segment.contains('.') {
                    None
                } else {
                    Some(format!("{}.html", p.trim_end_matches('/')))
                }
            };

            // A real dynamic-ID URL (e.g. `/dashboard/projects/focusanalyze/9`) needs BOTH
            // normalizations composed, not tried independently: `rewrite_dynamic_id_path`
            // maps it to `.../placeholder` (still no `.html`), which itself only exists on
            // disk as `.../placeholder.html`. Trying `html_fallback_path` against the
            // *original* path alone (`.../9.html`) can never find that file — only the
            // rewritten path does. Try, in order: exact match, `.html` on the exact path,
            // the dynamic-ID rewrite exact, then `.html` on the rewritten path.
            let rewrite = rewrite_dynamic_id_path(&path);
            let exact_asset = asset_resolver
                .get(path.clone())
                .or_else(|| html_fallback_path(&path).and_then(|p| asset_resolver.get(p)));
            let served_from_placeholder = exact_asset.is_none();
            let asset = exact_asset.or_else(|| {
                let rewritten = &rewrite.as_ref()?.path;
                asset_resolver
                    .get(rewritten.clone())
                    .or_else(|| html_fallback_path(rewritten).and_then(|p| asset_resolver.get(p)))
            });

            match asset {
                Some(mut asset) => {
                    if let (true, Some(rewrite)) = (served_from_placeholder, &rewrite) {
                        if carries_route_data(&asset.mime_type) {
                            if let Ok(body) = std::str::from_utf8(&asset.bytes) {
                                asset.bytes = substitute_real_ids(body, &rewrite.ids).into_bytes();
                            }
                        }
                    }
                    // tiny_http defaults to switching a response over to chunked
                    // Transfer-Encoding once its body exceeds 32KB (`chunked_threshold`),
                    // even though the full length is already known here (`asset.bytes` is
                    // fully in memory). Any exported page with real content — the projects
                    // list, performance views, a populated calendar — easily crosses that,
                    // and WebKit's HTTP client apparently doesn't get along with this
                    // library's specific chunked framing: curl parses the exact same bytes
                    // fine, but the app's own webview reports "an error occurred trying to
                    // load the resource" for anything past that size. There's no reason to
                    // ever chunk a fully-buffered static asset, so raise the threshold high
                    // enough that a real Content-Length header is always sent instead.
                    let mut response =
                        HttpResponse::from_data(asset.bytes).with_chunked_threshold(usize::MAX);
                    if let Ok(h) =
                        Header::from_bytes(b"Content-Type".as_slice(), asset.mime_type.as_bytes())
                    {
                        response.add_header(h);
                    }
                    if let Some(csp) = asset.csp_header {
                        if let Ok(h) =
                            Header::from_bytes(b"Content-Security-Policy".as_slice(), csp.as_bytes())
                        {
                            response.add_header(h);
                        }
                    }
                    if let Ok(h) = Header::from_bytes(b"Cache-Control".as_slice(), b"no-cache".as_slice())
                    {
                        response.add_header(h);
                    }
                    let _ = req.respond(response);
                }
                None => {
                    let _ = req.respond(HttpResponse::from_string("Not found").with_status_code(404));
                }
            }
        }
    });

    port
}

#[cfg(test)]
mod tests {
    use super::*;

    const PROJECTS: &str = "/dashboard/projects/focusanalyze";

    #[test]
    fn rewrites_a_project_view_and_keeps_its_id() {
        let rewrite = rewrite_dynamic_id_path(&format!("{PROJECTS}/5/board")).unwrap();
        assert_eq!(rewrite.path, format!("{PROJECTS}/placeholder/board"));
        assert_eq!(rewrite.ids, vec![("project_id", "5".to_string())]);
    }

    #[test]
    fn nested_route_keeps_each_id_under_its_own_param() {
        let rewrite = rewrite_dynamic_id_path(&format!("{PROJECTS}/5/goals/7")).unwrap();
        assert_eq!(rewrite.path, format!("{PROJECTS}/placeholder/goals/placeholder"));
        assert_eq!(
            rewrite.ids,
            vec![("project_id", "5".to_string()), ("goal_id", "7".to_string())]
        );
    }

    #[test]
    fn flight_data_requests_keep_their_extension() {
        let root = rewrite_dynamic_id_path(&format!("{PROJECTS}/5.txt")).unwrap();
        assert_eq!(root.path, format!("{PROJECTS}/placeholder.txt"));
        assert_eq!(root.ids, vec![("project_id", "5".to_string())]);

        let view = rewrite_dynamic_id_path(&format!("{PROJECTS}/5/board.txt")).unwrap();
        assert_eq!(view.path, format!("{PROJECTS}/placeholder/board.txt"));

        let tree = rewrite_dynamic_id_path(&format!("{PROJECTS}/5/__next._tree.txt")).unwrap();
        assert_eq!(tree.path, format!("{PROJECTS}/placeholder/__next._tree.txt"));
    }

    #[test]
    fn placeholder_requests_and_other_routes_are_not_rewritten() {
        assert!(rewrite_dynamic_id_path(&format!("{PROJECTS}/placeholder/board")).is_none());
        assert!(rewrite_dynamic_id_path("/dashboard/calendar").is_none());
    }

    fn project(id: &str) -> Vec<(&'static str, String)> {
        vec![("project_id", id.to_string())]
    }

    #[test]
    fn substitutes_every_shape_next_exports() {
        let router_tree = r#"[["project_id","placeholder","d",[]],{}]"#;
        let page_props = r#""params":{"project_id":"placeholder"}"#;
        let prefetch_tree = r#"{"name":"project_id","param":{"type":"d","key":"placeholder","siblings":[]}}"#;
        let escaped_in_html = r#""params":{"project_id":"placeholder"},["project_id","placeholder","d",[]]"#;

        for body in [router_tree, page_props, prefetch_tree, escaped_in_html] {
            let result = substitute_real_ids(body, &project("5"));
            assert!(!result.contains("placeholder"), "left behind in: {result}");
            assert!(result.contains('5'));
        }
    }

    #[test]
    fn nested_ids_do_not_cross_over() {
        let body = r#"{"project_id":"placeholder","goal_id":"placeholder"}"#;
        let ids = vec![("project_id", "5".to_string()), ("goal_id", "7".to_string())];
        assert_eq!(substitute_real_ids(body, &ids), r#"{"project_id":"5","goal_id":"7"}"#);
    }

    #[test]
    fn unrelated_placeholder_text_is_untouched() {
        let body = r#"<input placeholder="Search"/>{"placeholder":"placeholder"}"#;
        assert_eq!(substitute_real_ids(body, &project("5")), body);
    }

    #[test]
    fn unsafe_ids_are_never_written_into_the_page() {
        let body = r#"{"project_id":"placeholder"}"#;
        assert_eq!(substitute_real_ids(body, &project(r#"5"</script>"#)), body);
        assert_eq!(substitute_real_ids(body, &project("5%22")), body);
    }
}
