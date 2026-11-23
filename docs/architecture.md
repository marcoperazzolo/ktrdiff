# KTRDiff architecture

KTRDiff compares Pentaho Data Integration transformations (`.ktr`) **semantically**: it parses
both documents into a typed model, matches entities (steps, hops, notes, connections, fields),
detects every difference, classifies each one, and only then lets presentation modes filter what
is shown. Files are treated strictly as documents — nothing is ever executed, no variable is
expanded, no external resource is touched.

## Pipeline

```
before.ktr ─┐                                             ┌─ text renderer
            ├─ SecureXml → KtrParser → TransformationModel │
after.ktr ──┘                     │                        ├─ JSON renderer (schemaVersion 1)
                                  ▼                        │
                     Normalizer (semantic view)            ├─ HTML report (offline, single file)
                                  │                        │
                                  ▼                        └─ web app (ChangeSet JSON)
                     StepMatcher (identity + renames)
                                  │
                                  ▼
                     DiffEngine + StepAdapters  →  ChangeSet (complete, classified)
                                  │
                                  ▼
                     Mode filter (Quick / Advanced / Custom)  →  FilteredChangeSet
```

The `ChangeSet` is always complete. Quick/Advanced/Custom **never** influence parsing, matching
or detection; they partition the change list into `visible` and `hidden` at presentation time and
count what was hidden.

## Modules

The engine is TypeScript ([ADR 004](adr/004-typescript-client-side-engine.md)); boundaries as in
[ADR 002](adr/002-core-boundaries.md). npm workspaces, Node 22, strict TypeScript, Vitest.

| Module | Contents |
|---|---|
| `packages/core` (`@ktrdiff/core`) | pure engine, synchronous and deterministic, ECMAScript built-ins plus `TextDecoder` only (no Node/DOM API, checked by `typecheck` and `check:core`). `src/` folders: `util` (Java-semantics helpers, SHA-256), `xml` (strict tokenizer, limits), `model`, `parser` (KTR/KJB/KDB), `normalize`, `match`, `adapters` (incl. the Myers text diff), `engine` (file and directory engines, per-file summary), `profile` (config and modes), `render` (text, JSON, HTML, directory JSON). Public API in `src/index.ts` |
| `packages/cli` (`@ktrdiff/cli`) | Node CLI: `compare` (default), `directory`, `inspect`, `validate`, `fixtures`, `git`, `git-diff`, `git-install`; YAML configuration (`yaml`, bundled); `build.mjs` produces the single file `dist/ktrdiff.mjs` |
| `apps/web` (`@ktrdiff/web`) | Angular 21 app; `src/engine/` runs the core in a Web Worker (see the web UI notes); static build, strict CSP (`_headers`) |
| `parity/` | oracle tooling: builds the `v0.2.0` jar, records its outputs (`reference/` for fixtures and probes, `private-fixtures/.parity/` for local cases) and the shared comparison used by the parity tests |

`deploy/cloudflare` publishes the build as static assets (see the deployment notes).

```text
                        ┌──────────────── packages/core (pure, no I/O) ────────────────┐
 .ktr .kjb .kdb bytes ─▶│ xml ▶ parser ▶ normalize ▶ match ▶ engine+adapters ▶ render │─▶ text / JSON / HTML
                        └───────▲───────────────────────────────▲────────────────────────┘
                                │                               │
          packages/cli (Node: files, Git, YAML config)     apps/web (browser: Web Worker)
                                │                               │
                     dist/ktrdiff.mjs (one file)      static site on marcoperazzolo.com/ktrdiff
```

The Java modules of tag `v0.2.0` (deleted from `main` in phase 2) are the parity oracle; the rest
of this document still
uses their class names, which the TypeScript files mirror (`KtrParser` → `parser/ktr-parser.ts`).

## Core model (`packages/core/src/model`)

* `TransformationModel` — name, description, parameters, connections, steps, hops, notes,
  info properties, raw XML handle.
* `StepModel` — `logicalId` (assigned by the matcher), `originalName` (raw), `name` (trimmed),
  `type` (raw XML `<type>`), common properties (distribute, copies, partitioning…),
  step-specific config as a normalized XML subtree, position, error handling, raw XML node.
* `HopModel` — from/to step references (trimmed), enabled flag.
* `NoteModel` — text, position (x, y, width, height), style properties.
* `ConnectionModel` — name, type, host, port, database, username, redacted secrets, attributes.
* `Change` — id, kind, classification, entity, stepType, stepName, beforeName, afterName,
  fromStep, toStep, section, field, property, before, after, addedFragments, removedFragments,
  sourceXmlPath, confidence, volatile flag, rawDiff.
* `ChangeSet` — schemaVersion, summary, changes, warnings, errors, matchingDecisions, metadata.

## Parsing and security

`xml/secure-xml.ts` parses with its own strict tokenizer (no dependency): DOCTYPE and entity
declarations are rejected, only the predefined and numeric character references are expanded,
nothing external is ever loaded, and the input is bounded by size (default 50 MiB), element depth
(default 200) and element count (default 1,000,000, D3 in [parity.md](parity.md)). Parse failures map to
`invalid_xml`; a well-formed document whose root is not `<transformation>` maps to
`unsupported_document`; a `<transformation>` without the expected skeleton maps to `invalid_ktr`;
duplicate trimmed step names map to `duplicate_step_names`.

## Normalization rules (package `normalize`)

* newline normalization (`\r\n` → `\n`) for text comparison; original values preserved for display;
* step/hop/field names trimmed for identity (raw values kept — sql-flow has `Read Demo Customers\n`);
* empty element (no attributes, no children, blank text) ≡ absent element (Spoon adds e.g. `<row-meta/>`);
* steps, hops and field identities matched by key — Spoon 9.4 reorders `<step>` blocks
  alphabetically on save; SelectValues selected-field order is compared separately as functional;
* layout (`GUI/xloc`, `GUI/yloc`, `draw`) separated from functional config; note text separated
  from note position;
* **volatile storage properties** (`info/name`, `info/directory`, `info/created_user`,
  `info/created_date`, `info/modified_user`, `info/modified_date`, `info/trans_version`,
  `info/key_for_session_key`, `info/is_key_private`): rewritten by Spoon on every save; detected
  and shown in Advanced, classified `metadata` + `volatile`, ignored by strict fixture matching
  and hidden by Quick (counted as hidden);
* unknown tags are never dropped: they flow into generic comparison and produce `unknown_change`;
* field order, condition order, hop meaning of order are **not** discarded silently — where order
  significance is unknown the difference is reported as `potentially-functional`/`unknown`.

## Matching (package `match`) — see docs/matching.md

1. name+type pass (trimmed names);
2. exact semantic fingerprint pass (SHA-256 over the normalized semantic view, name and layout
   excluded) for renames with identical content;
3. similarity scoring for the remainder (same/compatible type only), threshold 0.85 (configurable);
   only unique above-threshold pairs become renames; ties → `ambiguous_step_match` warning and the
   steps stay added/removed;
4. matched pairs share a `logicalId`; hops are compared on logicalIds, so renames never produce
   hop churn.

## Adapters (package `adapters`)

`StepAdapter` SPI: `supports(type)`, `parse(...)`, `compare(before, after, ctx)`.
Registry order: `SelectValuesAdapter`, `FilterRowsAdapter`, `TableInputAdapter`,
`ScriptValueModAdapter` (type `ScriptValueMod` — alias `ModifiedJavaScriptValue` accepted via
`StepTypeAliases`), fallback `GenericStepAdapter` (never loses data; unknown tag → `unknown_change`
with XML path and raw diff). The generic adapter also runs for supported types to cover the
common envelope (distribute, copies, GUI, description…), while the specific adapter claims its
semantic sections (`fields`, `compare`, `sql`, `jsScripts`, …) so nothing is double-reported.

`XmlFallback` then checks matched entity XML against the semantic changes' source-path coverage.
It exposes residual attributes, repeated elements (without discarding duplicate keys), nested
configuration and unknown extensions as `unknown_change`. Keyed children pair by a unique
`name`, `jsScript_name` or `code`; non-unique keys fall back to positional comparison.
The safety net runs before filtering, and does not execute or infer the behaviour of unknown plugins.
Canonical equality uses sorted attributes and escaped content; display serialization separately
redacts secrets, so redaction never hides the fact that a secret changed.

## Classification

`functional` / `layout` / `metadata` / `configuration` / `potentially-functional` / `unknown` —
assigned at detection time by the adapter/engine, never changed by modes. SQL/script text changes
are functional; whitespace-only SQL changes are `metadata` when `sql.ignore_formatting` is on
(still present in the ChangeSet). Token comparison preserves quoted literals and comments;
whitespace inside literals is not formatting. Dollar-quoted dialects are handled conservatively.

## Modes (package `profile`)

Quick (default), Advanced (everything), Custom (driven by `.ktrdiff.yml` + CLI flags; precedence
CLI > repo config > user config > defaults). Filtering yields visible+hidden partitions and the
hidden-count summary (`3 layout changes hidden…`).

## Determinism

Change lists are sorted by a stable comparator (entity → step name → section → field → property
→ kind); matcher iteration orders are derived from document order with lexicographic tie-breaks;
no map iteration order leaks into output. JSON serialization uses a fixed property order.

## Secrets

`SecretRedactor` centralizes redaction: `password`, `proxy_password`, any attribute code ending
in `PASSWORD`, and Pentaho `Encrypted …` payloads become `[REDACTED]` in models, changes, logs,
JSON and HTML. Connection password changes are reported as changed with both sides redacted; the web
page's detail alone shows the stored text, read in the browser from the user's files (`revealed`).
