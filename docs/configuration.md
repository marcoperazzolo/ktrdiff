# Configuration — `.ktrdiff.yml`

Layers (later wins): application defaults → user `~/.ktrdiff.yml` → repository `.ktrdiff.yml`
→ CLI flags (or the `config` object of `POST /api/compare`).

```yaml
mode: custom            # quick | advanced | custom

include:                # custom mode: which classifications are visible
  functional: true
  layout: false
  metadata: true
  configuration: true
  potentially_functional: true
  unknown: true

layout:
  step_positions: false # show step moves (custom mode)
  note_positions: false # show note moves (custom mode)

notes:
  content: true         # show note text edits

renames:
  show: true            # custom mode: hide step_renamed entries when false
                        # (renames are identity-preserving — hops and internal changes
                        #  keep referring to the same logical step either way)

sql:
  ignore_formatting: true   # whitespace-only SQL change → metadata "formatting" instead of functional

scripts:
  ignore_whitespace: false  # same for JavaScript bodies

output:
  show_xml_paths: false
  show_raw_diff: true

matching:
  rename_threshold: 0.70    # similarity threshold for rename-with-modification
                            # (raise toward 0.85 for stricter matching, lower toward 0.6
                            #  to pair more aggressively in heavy reworks)

fail_on: none           # none | any | functional | unknown  (CLI exit code 1 when matched)

limits:
  max_file_mb: 50
```

CLI equivalents: `--mode`, `--ignore-layout`, `--include-layout`, `--ignore-sql-formatting` /
`--no-ignore-sql-formatting`, `--ignore-script-whitespace`, `--show-xml-paths`, `--show-raw`,
`--fail-on`, `--config <file>`, `--pentaho-version <v>`.

Notes:

* `sql.ignore_formatting` and `scripts.ignore_whitespace` affect **classification**, never
  detection: the change stays in the ChangeSet and is always available in Advanced mode.
* `include.functional: false` is honoured in Custom mode presentation, but nothing can make a
  functional change disappear from the ChangeSet, from Advanced mode, or from `--fail-on`.
