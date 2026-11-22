# Fixture guide

Fixtures are the golden tests of KTRDiff and are **read-only**: never edit a `.ktr` or an
`expected.yml` to make a test pass. Inconsistent fixtures get documented in
[fixture-issues.md](fixture-issues.md) and quarantined in `fixtures-known-issues.yml`.

## Layout

```
fixtures/<category>/<NNN-case>/            # current layout
fixtures/pdi-<version>/<category>/<case>/  # version-scoped layout (also supported)
├── before/<seed>.ktr
├── after/<seed>.ktr
└── expected.yml
```

The legacy flat layout (`before.ktr` / `after.ktr` next to `expected.yml`) is also accepted.
`fixture.seed` in `expected.yml` names the file inside `before/` and `after/`.

## Creating a new fixture

1. Copy a seed from `fixture-seeds/` (canonical-flow, sql-flow, script-flow, empty).
2. Open it in Spoon, save it as `before/<seed>.ktr`, apply exactly the change under test,
   save as `after/<seed>.ktr`. Prefer Spoon-produced files; set `manually_edited: true` when
   you hand-edit XML.
3. Write `expected.yml` following `fixture-seeds/expected-template.yml` (schema_version 1 —
   do not invent new fields; express detail through kind/section/field/property/before/after
   and `added_contains`/`removed_contains` for SQL/scripts).
4. Declare `pentaho_version` (e.g. `"9.4.0.0-343"`).
5. Run it: `./scripts/ktrdiff fixtures --id <your-id>`.

## What the runner does

For every fixture: loads `expected.yml`, locates the pair, compares in **Advanced** mode
(no filters), checks `result` and `error_code`, matches every declared change against the
actual ChangeSet (only non-null fields are compared; scalars compare loosely so YAML `18`
matches XML `"18"`), applies `strict` + `allow_extra` (which can never hide functional
changes), and prints a readable explanation on failure. Spoon save artifacts (info/name,
directory, modified_date, session key) are volatile and exempt from strict counting — that is
why a `strict: true` fixture saved twice by Spoon still passes.
