# Comparison modes

Modes are pure presentation. The pipeline always produces a **complete** ChangeSet
(detect first, filter later); `ModeFilter` partitions it into visible and hidden changes and
counts what was hidden. A change hidden by Quick is still in the ChangeSet, still visible in
Advanced, still enableable in Custom, and still counted.

## Quick (default)

Shows: step added/removed/renamed, every functional change, hops, fields, SQL, scripts,
filters, note added/removed/text-changed, unknown properties, warnings, errors.

Hides (with a count and a hint to switch mode):

* step X/Y positions and note positions (`layout`),
* Spoon save artifacts (`volatile` storage metadata: info/name, directory, modified_date,
  session key…),
* formatting-only SQL/script changes when `sql.ignore_formatting` / `scripts.ignore_whitespace`
  classified them as such.

## Advanced

Shows every detected change including volatile noise, with XML paths, raw diffs when available,
and the matcher's decisions with confidence scores.

## Custom

Driven by configuration (UI checkboxes, CLI flags, `.ktrdiff.yml`):

* per-classification include map (`functional`, `layout`, `metadata`, `configuration`,
  `potentially_functional`, `unknown`),
* `layout.step_positions`, `layout.note_positions`,
* `notes.content`,
* `sql.ignore_formatting`, `scripts.ignore_whitespace` (classification-time options),
* `output.show_xml_paths`, `output.show_raw_diff`.

Volatile Spoon artifacts remain Advanced-only.

## Precedence

```
CLI arguments  >  repository .ktrdiff.yml  >  user ~/.ktrdiff.yml  >  application defaults
```

See [configuration.md](configuration.md) for the full file format.
