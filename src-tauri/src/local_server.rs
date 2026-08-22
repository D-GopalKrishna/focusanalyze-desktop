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

/// Serves the FE static export over real `http://` (see `LOCALHOST_PORT` in `lib.rs` for
/// why) using Tauri's own asset resolver — the same one the `tauri://` protocol and the
/// (now-replaced) `tauri-plugin-localhost` both use, so MIME types/CSP headers stay correct.
/// Unlike that plugin, this adds a fallback for dynamic-ID routes: on an exact-match miss,
/// retry with the id segment(s) rewritten to `placeholder` before giving up.
pub fn spawn(app: AppHandle, host: &str, port: u16) {
    let asset_resolver = app.asset_resolver();
    let address = format!("{host}:{port}");

    std::thread::spawn(move || {
        let server = Server::http(&address).expect("failed to start local asset server");

        for req in server.incoming_requests() {
            let path: String = req
                .url()
                .parse::<http::Uri>()
                .map(|uri| uri.path().to_string())
                .unwrap_or_else(|_| req.url().to_string());

            let asset = asset_resolver
                .get(path.clone())
                .or_else(|| rewrite_dynamic_id_path(&path).and_then(|p| asset_resolver.get(p)));

            match asset {
                Some(asset) => {
                    let mut response = HttpResponse::from_data(asset.bytes);
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
}
