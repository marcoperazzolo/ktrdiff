# CLI reference

The CLI is a Node program (Node 22 or later). `npm run build:cli` bundles it, with the engine, into
one dependency-free file, `packages/cli/dist/ktrdiff.mjs`, that can be copied anywhere and run
without `node_modules`:

```powershell
npm run build:cli
node packages/cli/dist/ktrdiff.mjs a.ktr b.ktr --mode advanced
```

Below, `ktrdiff` stands for `node <path>/ktrdiff.mjs`.

```
ktrdiff <before.ktr> <after.ktr> [options]      # default command = compare
ktrdiff compare <before.ktr> <after.ktr> [options]
ktrdiff directory|dir <before-dir> <after-dir> [options]
ktrdiff inspect <file.ktr>
ktrdiff validate <file.ktr>
ktrdiff fixtures [--dir fixtures] [--known-issues fixtures-known-issues.yml] [--id steps-004]
ktrdiff git <old|rev> <new|rev> [-- path/to/file.ktr] [options]
ktrdiff git-diff <path> <old-file> <old-hex> <old-mode> <new-file> <new-hex> <new-mode> [options]
ktrdiff git-install [--apply-repo]
```

`.kjb` and `.kdb` documents are accepted wherever `.ktr` is shown. Git is only run as a local
command with argument arrays (never through a shell). `git-diff` is the `GIT_EXTERNAL_DIFF`
driver; `git-install` prints the repository-local configuration, which runs
`node "<absolute path of ktrdiff.mjs>"`, and applies it only with `--apply-repo`.

## Compare options

| Option | Meaning |
|---|---|
| `--mode quick\|advanced\|custom` | presentation mode (default quick) |
| `--format text\|json\|html` | output format (default text) |
| `--output <file>` | write the report to a file |
| `--config <file>` | explicit `.ktrdiff.yml` (otherwise repo + user config are merged) |
| `--ignore-layout` / `--include-layout` | hide or show layout changes |
| `--[no-]ignore-sql-formatting` | whitespace-only SQL → non-functional (default on) |
| `--[no-]ignore-script-whitespace` | same for scripts (default off) |
| `--show-xml-paths` | include XML paths |
| `--show-raw` | include raw diffs |
| `--fail-on any\|functional\|unknown` | exit 1 when the ChangeSet contains such changes |
| `--pentaho-version <v>` | declare the PDI version of the inputs (e.g. 9.4.0.0-343) |
| `--verbose` | timing/counters on stderr (never document content) |
| `--color auto\|always\|never` | colours in text reports on stdout: added green, removed red, renamed blue, modified yellow, moved cyan, unknown/warnings magenta. `auto` (default) colours only a terminal; a non-empty `NO_COLOR` or `TERM=dumb` disables it; JSON, HTML and `--output` files are never coloured |
| `--version`, `--help` | the usual |

## Exit codes

```
0  comparison completed, no failure condition
1  differences found and --fail-on matched them
2  input, parsing or configuration error (file not found, invalid_xml, bad flag…)
3  unexpected internal error
```

Without `--fail-on`, finding differences is **not** an error.

## Examples

```bash
ktrdiff a.ktr b.ktr --fail-on any
ktrdiff a.ktr b.ktr --mode advanced --show-xml-paths --show-raw
ktrdiff a.ktr b.ktr --format html --output report.html    # offline single-file report
ktrdiff fixtures --id steps-004                           # one golden fixture
ktrdiff inspect etl/customers.ktr                         # steps, types, adapters, hops, notes
```
