# Pentaho version support

KTRDiff is not designed around a single Pentaho release. The engine uses one structural
parser + one normalization layer for every version, with version-specific rules only where a
real, verified difference exists, and the generic comparator as universal fallback.

## Tested versions

| Version | Status | Evidence |
|---|---|---|
| **9.4.0.0-343** | tested | all 14 fixtures produced with this build; step types RowGenerator, SelectValues, FilterRows, Dummy, TableInput, ScriptValueMod verified end-to-end |

## Presumed compatible

* 9.x releases (same KTR skeleton, same step envelope);
* 8.x and 10.x are expected to parse: unknown tags are preserved and surface as
  `unknown_change`, never dropped and never a parse failure. Not yet covered by fixtures —
  treat comparisons across untested versions as best-effort until `fixtures/pdi-<version>/`
  entries exist.

## How the version flows through the system

* `PentahoVersion.parse("9.4.0.0-343" | "pdi-10.2" | …)` — tolerant; null/absent is always fine.
* Fixture runner reads `fixture.pentaho_version` from every `expected.yml` and passes it to the
  engine via `KtrInput`.
* CLI: `--pentaho-version`; API: `"pentahoVersion"` in the request body.
* Observed KTR 9.4 files do **not** embed the product version, so the declaration is external
  by design; if a future dialect embeds one, the parser can pick it up without API changes.
* Adapters receive the version through `ComparisonContext` and can override
  `supports(stepType, version)` when a release changed a step's semantics. None needs to today.

## Fixture layouts

Both are discovered automatically, no migration required:

```
fixtures/<category>/<case>/                      # current layout (version in expected.yml)
fixtures/pdi-<version>/<category>/<case>/        # version-scoped layout
fixtures/cross-version/<case>/                   # future equivalence cases
```

## Version-specific serialization differences

A property that differs only because two Spoon versions serialize the same value differently
must not be classified functional — but it is never ignored silently either. Every such
equivalence rule must be: documented here, tied to the affected versions, covered by a
`cross-version` fixture, applied explicitly, and visible in Advanced mode.

Rules currently active (all version-independent, observed on 9.4):

| Rule | Scope | Rationale |
|---|---|---|
| empty element ≡ absent element | generic comparison | Spoon adds e.g. `<row-meta/>` on re-save |
| volatile storage properties (`info/name`, `directory`, `created/modified user+date`, `trans_version`, `key_for_session_key`, `is_key_private`) | `<info>` | rewritten by Spoon on every save |
| trimmed step/hop identity | names | trailing newlines inside `<name>` in real files |
| `ModifiedJavaScriptValue` ⇄ `ScriptValueMod` | step type comparison | display-name-derived alias vs plugin ID |

Planned when multi-version fixtures arrive: `fixtures/cross-version/001-equivalent-select-values/`,
`002-equivalent-empty-values/`, `003-real-functional-change/`.
