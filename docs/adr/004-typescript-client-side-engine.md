# ADR 004 — Single TypeScript engine, client-side only

## Status
Accepted (2026-11-18). Supersedes ADR 001 (Java version), the Java backend part of ADR 003 and
the Workers Paid + Containers deployment in `docs/cloudflare-deployment.md`.
The last Java-engine snapshot is tagged `v0.2.0`.

## Context
Up to `v0.2.0` the engine (~7k lines of Java) ran on a stateless HTTP server and the Angular UI
uploaded both documents to it. That conflicts with the product requirements:

* **Privacy by construction**: documents must never leave the user's machine. "We don't log
  uploads" is weaker than "there is no upload".
* **Hosting**: `marcoperazzolo.com/ktrdiff` on the Cloudflare **free** plan. A JVM needs Workers
  Paid + Containers or a VPS, i.e. money and an extra server to patch and monitor.
* **Maintainability**: one language and one engine for the web UI and the command line.
  The Angular frontend is already TypeScript; a Java backend for a document diff is overkill.
* **Git integration**: `git diff`/`difftool` drivers and CI reports must work as a local
  command, never by calling a running server.

## Decision
Port the engine to **TypeScript** and make it the only implementation:

* `packages/core` — pure TypeScript, no Node or DOM APIs, minimal dependencies (at most a small,
  strict XML parser that rejects DOCTYPE/entities). Runs unchanged in the browser and in Node.
* `apps/web` — Angular app; the engine runs in a **Web Worker**. The build is static files only.
* `packages/cli` — Node CLI (compare, git textconv/diff/difftool drivers, CI reports, corpus
  tools), bundled to a single dependency-free `.mjs` file. Git is invoked with argument arrays,
  never through a shell.
* Hosting: Cloudflare Workers **static assets** (free) routed on `marcoperazzolo.com/ktrdiff*`.
  No server-side code touches documents.

During the port the `v0.2.0` Java engine is the **oracle**: its JSON output on every fixture and
on local real-world document pairs is the reference the TypeScript engine must match (or differ
from only through documented, intentional changes). After parity, the Java modules, web API,
Dockerfile and Containers config are deleted from `main`; they stay reachable through the tag.

## Alternatives considered
* **Keep Java on a server** — no rewrite, but paid hosting, uploads, and a server to secure.
* **Compile Java to JS/WASM (TeaVM, GraalVM Web Image, CheerpJ)** — keeps one Java source, but
  javax.xml/crypto must be replaced anyway, builds and debugging get niche, bundles get heavier.
  Pentaho users have a JVM, but Angular developers and CI agents have Node just as well.
* **Two engines (Java CLI + TS web)** — guaranteed divergence. Rejected.

## Consequences
* One toolchain: Node 22 LTS, npm workspaces, TypeScript strict mode, Vitest, Playwright.
* A future Spoon (Java) plugin is no longer a natural fit; it is out of scope.
* Code comments and identifiers are English; UI strings are IT/EN through i18n.
* Security relies on a small attack surface: no backend, strict CSP, no third-party scripts,
  no `innerHTML` with document content, bounded parsing (size, depth, element count).
