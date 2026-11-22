# Security

KTRDiff treats every `.ktr`, `.kjb` and `.kdb` as a potentially hostile document and never
executes anything it contains. Implemented measures, each covered by tests where meaningful:

## XML parsing (`packages/core/src/xml`)

The core parses with its own strict tokenizer (`tokenizer.ts`, `secure-xml.ts`), no dependency:

| Measure | Implementation |
|---|---|
| DTDs | any `DOCTYPE` is rejected → `invalid_xml` |
| Entities | only the five predefined entities and valid character references; anything else is rejected, nothing external is ever loaded |
| Size limit | default 50 MiB per document (`limits.max_file_mb`) → `file_too_large` |
| Depth limit | 200 nested elements → `invalid_xml` |
| Element count | 1,000,000 elements → `invalid_xml` (D3 in [parity.md](parity.md)) |
| Malformed input | `invalid_xml`; non-Pentaho XML → `unsupported_document`; missing skeleton → `invalid_ktr` |

## No execution, ever

The engine reads documents and compares text. It never: runs a transformation, evaluates
JavaScript, executes SQL, opens database connections, expands `${variables}`, reads files
referenced by a document, or performs any network access derived from document content. The
core has no I/O at all: `npm run check:core` fails if it uses a Node or DOM API.

## Secrets

`SecretRedactor` is the single choke-point: `password`, `*_password`, `*password`,
passphrases and secret keys become `[REDACTED]` **before** entering a Change, so no renderer,
JSON payload, HTML report or UI view can leak them — including Pentaho `Encrypted …` payloads
(the encrypted form is still treated as a secret). A password change is reported as
`connection_changed property=password [REDACTED] → [REDACTED]`. Tests assert absence of the raw
values in text, JSON and HTML outputs.

The one exception, chosen by the owner (22 November 2026): the web page's change detail shows the stored
text of a changed secret (Pentaho's reversibly encrypted `Encrypted …`), read by the browser from
the user's own two documents (`revealed`, set in `apps/web/src/engine/details.ts`); the list line
only says it changed, and the JSON and HTML downloads keep `[REDACTED]`. An e2e test checks that the JSON download
contains no stored value.

## Web app (no server)

* Static files only: the comparison runs in a same-origin Web Worker, documents are read as
  bytes in the browser and never sent anywhere (an e2e test checks that comparisons only cause
  same-origin GETs of static files).
* Strict headers from `apps/web/_headers`, enforced in the e2e tests and on Cloudflare:
  `Content-Security-Policy` with `default-src 'self'`, no inline script or style, no other
  origin, `object-src 'none'`, `frame-ancestors 'none'`, `form-action 'none'`, Trusted Types
  required (Angular's policies plus one `default` policy that approves only the worker chunk);
  `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, a restrictive
  `Permissions-Policy` and `Cross-Origin-Opener-Policy: same-origin`.
* Document text is rendered as text, never as HTML (component tests use a malicious value).
* No telemetry, no accounts, no database; only the language choice is kept in local storage.


### Review of 22 November 2026

* Headers served on the live site: the CSP above (`default-src 'self'`, Trusted Types, no inline
  script, `frame-ancestors 'none'`), `X-Content-Type-Options`, `Referrer-Policy: no-referrer`,
  `Permissions-Policy`, `Cross-Origin-Opener-Policy`. HSTS is not set by the app: it applies to the
  whole host, so it belongs to the zone (Cloudflare → SSL/TLS → Edge Certificates → HSTS).
* No HTML sink in the app (`innerHTML`, `bypassSecurityTrust…`, `eval`, `new Function`); document
  text is always interpolated. The `default` Trusted Types policy approves only the same-origin
  engine worker chunk.
* The HTML report escapes every document value and carries its own CSP (no script at all).
* Production dependencies: `npm audit` finds none. A critical advisory of Vitest (dev only) concerns
  its UI server, which the project never starts; the upgrade waits for npm (an npm 10 resolver bug).

## HTML report

Single offline file: all dynamic text HTML-escaped, `Content-Security-Policy` meta
(`default-src 'none'` + inline style/script only, `img-src data:`), no external requests.

## Git integration

`ktrdiff git-install` prints configuration by default; it only writes repository-local
`git config` entries with the explicit `--apply-repo` flag and never touches global
configuration or `.gitattributes`. Git is always run with argument arrays (never a shell), and
revision contents are read with `git show` straight into memory: no temporary files.

## Dependency hygiene

Runtime dependencies: none in the core, `yaml` in the CLI (bundled into the single file),
Angular in the web app. Versions are pinned by one root lockfile; CI runs `npm audit` (report only).
