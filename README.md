<p align="center"><img src="docs/brand/svg/ktrdiff-logo.svg" width="96" alt="KTRDiff"></p>

# KTRDiff engine

**Compare two versions of Pentaho Data Integration transformations (`.ktr`), jobs (`.kjb`),
database connections (`.kdb`) or whole folders — by steps, fields, queries and hops, not by XML
lines.** This repository holds the comparison engine and its command-line interface. The web
app built on it runs at [marcoperazzolo.com/ktrdiff](https://marcoperazzolo.com/ktrdiff), by
[Marco Perazzolo](https://marcoperazzolo.com).

A plain `git diff` of a `.ktr` file is XML noise: Spoon reorders steps, rewrites dates and caches
column metadata on every save. KTRDiff reads both versions as Pentaho documents and reports what
a consultant would say:

```text
STEP RENAMED
  - Rejected Rows
  + Rejected Customers  [Dummy]

STEP ADDED
  Log Accepted [WriteToLog]

MODIFIED STEP
  Filter Valid Customers [FilterRows]

  AGE
    Value:
    - 18
    + 21

MODIFIED STEP
  Read Demo Customers [TableInput]
  SQL changed:
  + AND deleted = 0
```

## Before / After

One real edit in Spoon: in *Filter Valid Customers* the minimum age goes from **18** to **21**.
Nothing else was touched, but Spoon re-saved the file, reordered the steps and bumped its
metadata. The two files are in
[`fixtures/filters/001-minimum-age-18-to-21`](fixtures/filters/001-minimum-age-18-to-21).

**Before — `git diff`**: `1 file changed, 119 insertions(+), 127 deletions(-)`, 318 lines in
6 hunks. An excerpt:

```diff
diff --git a/canonical-flow.ktr b/canonical-flow.ktr
index 3eb38dc..2cbff29 100644
--- a/canonical-flow.ktr
+++ b/canonical-flow.ktr
@@ -1,11 +1,11 @@
 <transformation>
   <info>
-    <name>canonical-flow.ktr</name>
+    <name>after</name>
@@ -428,8 +428,8 @@
-    <modified_date>2026/07/14 00:09:18.018</modified_date>
-    <key_for_session_key/>
+    <modified_date>2026/07/14 11:38:20.715</modified_date>
+    <key_for_session_key>H4sIAAAAAAAAAAMAAAAAAAAAAAA=</key_for_session_key>
@@ -456,6 +456,96 @@
+  <step>
+    <name>Accepted Rows</name>
+    <type>Dummy</type>
     … 22 more added lines …
+  <step>
+    <name>Filter Valid Customers</name>
+    <type>FilterRows</type>
     … 32 more added lines …
+            <leftvalue>AGE</leftvalue>
+            <function>&gt;=</function>
+            <rightvalue/>
+            <value>
+              <name>constant</name>
+              <type>Integer</type>
+              <text>21</text>
     … 3 more hunks, ~220 lines: the same steps removed from their old position, including …
-              <text>18</text>
```

The steps show up as *added* in one place and *removed* in another; the one real change
(`18` → `21`) is split 140 lines apart, mixed with timestamps and session keys.

**After — `node ktrdiff.mjs before/canonical-flow.ktr after/canonical-flow.ktr`**, the complete
output:

```text
Transformation: after
Result: changed  |  Mode: quick

Summary
  Functional: 1
  Layout: 0
  Metadata: 0
  Configuration: 0
  Potentially functional: 0
  Unknown: 0
  Hidden by quick mode: 4

MODIFIED STEP
  Filter Valid Customers [FilterRows]

  AGE
    Value:
    - 18
    + 21

HIDDEN BY QUICK MODE
  4 metadata changes
  (run with --mode advanced to show everything)
```

One functional change, named by step, field and value. The Spoon save noise is still detected,
only hidden: `--mode advanced` shows it.

## What it does

- **Matches steps by meaning**: a renamed step keeps its identity (exact same content, or a unique
  high-confidence match); ambiguous cases stay added + removed with a warning, never a guess. Hops
  compare on step identities, so a rename does not churn them.
- **Reads the common steps in depth** (Table input, Select values, Filter rows, Modified JavaScript
  value and many job entries) and compares every other step generically, field by field; unknown
  XML is always reported, never dropped.
- **Classifies** each change: functional, layout, metadata, configuration, potentially functional,
  unknown. Three modes filter only the presentation: **quick** (what matters to the data flow),
  **advanced** (everything) and **custom**.
- **Folders**: pairs files by path, then unique name, then content (renamed files).
- **Safe by construction**: its own XML tokenizer (no DTD, no external entities, size and depth
  limits); nothing in a document is executed, expanded or contacted (no SQL, scripts, connections
  or variables); passwords and other secrets are redacted in every output. See
  [docs/security.md](docs/security.md).
- **One TypeScript engine**, no runtime dependencies, runs in Node and in the browser. Its results
  match the earlier Java engine (v0.2.0) on every public case: [docs/parity.md](docs/parity.md).

## Command line

Build the single-file CLI (Node 22 or later, no `node_modules` needed to run it):

```bash
npm ci
npm run build:cli          # writes packages/cli/dist/ktrdiff.mjs
node packages/cli/dist/ktrdiff.mjs --help
```

```bash
node ktrdiff.mjs before.ktr after.ktr                       # readable report
node ktrdiff.mjs before.ktr after.ktr --mode advanced       # every change, layout included
node ktrdiff.mjs before.ktr after.ktr --format html --output report.html
node ktrdiff.mjs dir release-1.4/ release-1.5/ --format json --output changes.json
node ktrdiff.mjs git HEAD~1 HEAD -- etl/load_orders.ktr     # two Git revisions of a file
```

Exit codes: `0` done, `1` when `--fail-on any|functional|unknown` matches, `2` on errors (missing
file, invalid XML, different document kinds). Full reference: [docs/cli.md](docs/cli.md);
Git difftool and diff driver: [docs/git-integration.md](docs/git-integration.md).

## In a CI build (Jenkins)

Compare the ETL folder of the branch with the one of `main`, keep the report, and mark the build
unstable when the behaviour changes:

```groovy
pipeline {
  agent any
  stages {
    stage('ETL changes') {
      steps {
        sh 'git fetch origin main && git worktree add --force ../base origin/main'
        catchError(buildResult: 'SUCCESS', stageResult: 'UNSTABLE') {
          sh 'node tools/ktrdiff.mjs dir ../base/etl etl --format json --output ktrdiff.json --fail-on functional'
        }
        sh 'node tools/ktrdiff.mjs dir ../base/etl etl > ktrdiff.txt || true'
        archiveArtifacts artifacts: 'ktrdiff.json, ktrdiff.txt'
      }
    }
  }
}
```

`tools/ktrdiff.mjs` is the built CLI, committed or downloaded once; it needs only Node 22. The
same works in GitHub Actions or GitLab CI.

## Development

```bash
npm ci
npm run verify        # typecheck, core purity, unit and golden-fixture tests, parity, CLI bundle
npm run check:ported  # every test of the Java engine has a TypeScript twin
```

Layout: `packages/core` (the pure engine: parsing, normalization, matching, detection,
classification, rendering), `packages/cli`, `fixtures/` (golden cases with expected changes),
`parity/` (recorded outputs of the Java engine). Architecture:
[docs/architecture.md](docs/architecture.md), matching: [docs/matching.md](docs/matching.md).

## License

[MIT](LICENSE). The Pentaho step icons are not part of this repository.
