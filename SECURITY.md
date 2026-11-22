# Security policy

KTRDiff reads potentially untrusted XML documents. Its security posture is described in
[docs/security.md](docs/security.md); highlights:

* XML parsing is hardened: DTDs disallowed, external general/parameter entities disabled,
  XInclude off, external DTD/schema access blanked, file-size and element-depth limits.
* Nothing found inside a KTR is ever executed or contacted: no SQL, no JavaScript, no database
  connections, no variable expansion, no file or network access derived from document content.
* Passwords and secret-like properties are redacted centrally (`[REDACTED]`) before they can
  reach any model, report, log or API response — including Pentaho `Encrypted …` payloads. The
  web page's change detail alone shows a changed secret's stored text, read in the browser from
  the user's own files; downloads keep it redacted (see docs/security.md).
* The web server processes uploads entirely in memory, stores nothing, logs no document
  content, sends no telemetry, and rejects oversized requests.
* HTML reports escape all dynamic text and carry a restrictive Content-Security-Policy;
  the report works offline with no external resources.
* The static file handler normalizes paths and refuses anything outside the UI directory.

## Reporting a vulnerability

Open a private security advisory or contact the maintainer directly (see repository metadata).
Please do not open public issues for exploitable problems. Reports should include the affected
component (core parser / CLI / web API / UI), a reproduction, and the impact you foresee.

## Scope notes for researchers

* The comparison engine is expected to be safe on hostile `.ktr` inputs: parser crashes,
  entity expansion, path traversal via the web static handler, or secret leakage into any
  output are all in scope and considered bugs.
* The local web server binds to 127.0.0.1 by design and is not hardened for public exposure;
  deploying it publicly is expected to happen behind a reverse proxy with its own limits.
