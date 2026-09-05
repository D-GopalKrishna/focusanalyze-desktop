use tauri::AppHandle;
use tiny_http::{Header, Response as HttpResponse, Server};

/// A path segment in a known dynamic route: either a literal, or a stand-in for the
/// unbounded DB-assigned id that `generateStaticParams()` only pre-rendered one file for
/// (the literal string `"placeholder"` — see the `generateStaticParams` comments across
/// `focusanalyze-fe/app/(auth)/(dashboard)/**`).
enum Segment {
    Fixed(&'static str),
    Id,
}

/// Every dynamic-ID route the FE build pre-renders as a single `.../placeholder/...` file.
/// Keep in sync with the `generateStaticParams()` calls in focusanalyze-fe — anything new
/// there needs a matching template here, or a real click into that page will 500 exactly
/// like the `/dashboard/projects/focusanalyze/<real-id>` bug this file fixes.
const ROUTE_TEMPLATES: &[&[Segment]] = &[
    &[Segment::Fixed("dashboard"), Segment::Fixed("admin"), Segment::Fixed("teams"), Segment::Id],
    &[Segment::Fixed("dashboard"), Segment::Fixed("admin"), Segment::Fixed("user"), Segment::Id],
    &[Segment::Fixed("dashboard"), Segment::Fixed("projects"), Segment::Fixed("focusanalyze"), Segment::Id],
    &[Segment::Fixed("dashboard"), Segment::Fixed("projects"), Segment::Fixed("focusanalyze"), Segment::Id, Segment::Fixed("board")],
    &[Segment::Fixed("dashboard"), Segment::Fixed("projects"), Segment::Fixed("focusanalyze"), Segment::Id, Segment::Fixed("calendar")],
    &[Segment::Fixed("dashboard"), Segment::Fixed("projects"), Segment::Fixed("focusanalyze"), Segment::Id, Segment::Fixed("list")],
    &[Segment::Fixed("dashboard"), Segment::Fixed("projects"), Segment::Fixed("focusanalyze"), Segment::Id, Segment::Fixed("timeline")],
    &[Segment::Fixed("dashboard"), Segment::Fixed("projects"), Segment::Fixed("focusanalyze"), Segment::Id, Segment::Fixed("tracks")],
    &[Segment::Fixed("dashboard"), Segment::Fixed("projects"), Segment::Fixed("focusanalyze"), Segment::Id, Segment::Fixed("goals")],
    &[Segment::Fixed("dashboard"), Segment::Fixed("projects"), Segment::Fixed("focusanalyze"), Segment::Id, Segment::Fixed("releases")],
    &[Segment::Fixed("dashboard"), Segment::Fixed("projects"), Segment::Fixed("focusanalyze"), Segment::Id, Segment::Fixed("goals"), Segment::Id],
    &[Segment::Fixed("dashboard"), Segment::Fixed("projects"), Segment::Fixed("focusanalyze"), Segment::Id, Segment::Fixed("releases"), Segment::Id],
];

/// If `path` matches a known dynamic-route template as a prefix, return the equivalent
/// `placeholder`-substituted path (keeping any trailing segments — e.g. Next's RSC payload
/// filename, which encodes the route *shape* not the param value — unchanged). Real
/// production HTML/RSC content only exists on disk for the literal `placeholder` id; the
/// page itself resolves the *real* id from the browser's actual URL at runtime via
/// `useParams()`, so serving the placeholder's bytes for any id is correct.
fn rewrite_dynamic_id_path(path: &str) -> Option<String> {
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
                Segment::Id => !actual.is_empty(),
            })
        })
        .max_by_key(|template| template.len())?;

    let mut rewritten: Vec<&str> = Vec::with_capacity(requested.len());
    for (i, seg) in template.iter().enumerate() {
        rewritten.push(match seg {
            Segment::Fixed(s) => s,
            Segment::Id => {
                if requested[i] == "placeholder" {
                    // Already the placeholder — no rewrite needed, and more importantly no
                    // infinite-loop risk from "rewriting" it to itself.
                    return None;
                }
                "placeholder"
            }
        });
    }
    rewritten.extend_from_slice(&requested[template.len()..]);
    Some(format!("/{}", rewritten.join("/")))
}

/// Serves the FE static export over real `http://` (see `LOCALHOST_PORTS` in `lib.rs` for
/// why) using Tauri's own asset resolver — the same one the `tauri://` protocol and the
/// (now-replaced) `tauri-plugin-localhost` both use, so MIME types/CSP headers stay correct.
/// Unlike that plugin, this adds a fallback for dynamic-ID routes: on an exact-match miss,
/// retry with the id segment(s) rewritten to `placeholder` before giving up.
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
            let rewritten = rewrite_dynamic_id_path(&path);
            let asset = asset_resolver
                .get(path.clone())
                .or_else(|| html_fallback_path(&path).and_then(|p| asset_resolver.get(p)))
                .or_else(|| rewritten.clone().and_then(|p| asset_resolver.get(p)))
                .or_else(|| {
                    rewritten
                        .and_then(|p| html_fallback_path(&p))
                        .and_then(|p| asset_resolver.get(p))
                });

            match asset {
                Some(asset) => {
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
