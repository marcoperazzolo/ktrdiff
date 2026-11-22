# Changelog

## 0.3.0-dev

First public version of the KTRDiff engine.

* Compares two versions of Pentaho Data Integration transformations (`.ktr`), jobs (`.kjb`),
  database connections (`.kdb`) or whole folders, by steps, fields, queries and hops.
* Matches steps by identity, so renamed steps are reported as renamed, not as added + removed.
* Semantic comparison of Table input, Select values, Filter rows, Modified JavaScript value and
  many job entries; every other step is compared field by field, unknown XML is always reported.
* Classifies every change (functional, layout, metadata, configuration, potentially functional,
  unknown) and filters the presentation with the quick, advanced and custom modes.
* Single-file Node CLI (`ktrdiff.mjs`, Node 22+): text, JSON and HTML reports, folder comparison,
  Git revisions, `--fail-on` for CI builds.
* Hardened XML reading, nothing in a document is executed, secrets are redacted in every output.
