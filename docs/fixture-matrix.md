# Fixture matrix

Generated during Phase 0 inspection (2026-07-14). 14 fixtures found under `fixtures/`.
All use the nested layout `before/<seed>.ktr` + `after/<seed>.ktr` + `expected.yml` (no legacy flat layout present).

Seeds present in `fixture-seeds/`: `canonical-flow.ktr` (5 steps), `script-flow.ktr` (3 steps), `sql-flow.ktr` (2 steps + MARIADB connection), `empty-transformation.ktr` (0 steps), `after.ktr` (stray re-save of canonical flow, unused by fixtures).

| Fixture | Seed | Step types involved | Expected change(s) | Classification | Adapter | Test status | Notes |
|---|---|---|---|---|---|---|---|
| `basic/001-identical` | canonical-flow | RowGenerator, SelectValues, FilterRows, Dummy×2 | none (`result: unchanged`) | — | — | active | before/after byte-identical |
| `layout/001-step-moved` | canonical-flow | SelectValues | `step_moved` (Select Customer Fields, 368/384 → 400/432) | layout | generic | active | Spoon re-save: steps reordered alphabetically + volatile `info/*` changes |
| `select-values/001-type-string-to-none` | canonical-flow | SelectValues | `field_property_changed` CUSTOMER_CODE type String → None (meta-data tab) | functional | SelectValues | active | `changes:`/`allow_extra:` at YAML root level, not under `expected:` |
| `filters/001-minimum-age-18-to-21` | canonical-flow | FilterRows | `filter_changed` AGE value 18 → 21 | functional | FilterRows | active | `changes:` at YAML root level; condition `<text>` 18→21 |
| `sql/001-where-condition-changed` | sql-flow | TableInput | `sql_changed`, `added_contains: ["AND deleted = 0"]` | functional | TableInput | active | Spoon also added empty `<row-meta/>`; step name has trailing newline in XML |
| `scripts/001-script-line-changed` | script-flow | ScriptValueMod | `script_changed`, `added_contains: [".toUpperCase()"]` | functional | ScriptValueMod | active | expected `step_type: ModifiedJavaScriptValue` vs XML `<type>ScriptValueMod</type>` → alias table |
| `hops/001-target-changed` | canonical-flow | SelectValues→FilterRows/Dummy | `hop_removed` (SCF→Filter Valid Customers) + `hop_added` (SCF→Accepted Rows), presence encoded as `before/after` booleans | functional | — | active | |
| `steps/001-step-added` | canonical-flow | Dummy | expected.yml declares **steps-002** (Rejected Rows removed) but KTR adds step "Dummy (do nothing)" | functional | — | **quarantined** | see [fixture-issues.md](fixture-issues.md) issue 1 |
| `steps/002-step-removed` | canonical-flow | Dummy | expected.yml declares **steps-001** (Audit Rows added) but KTR removes "Rejected Rows" + its hop | functional | — | **quarantined** | see [fixture-issues.md](fixture-issues.md) issue 1 |
| `steps/003-step-renamed` | canonical-flow | SelectValues | `step_renamed` Select Customer Fields → Normalize Customer Fields (exact rename; hops must NOT change) | functional | matcher | active | XML hop from/to strings change; logical identity must absorb them |
| `steps/004-step-renamed-and-modified` | canonical-flow | SelectValues | `step_renamed` + `field_property_changed` CUSTOMER_CODE length 20 → 50 | functional | matcher + SelectValues | active | internal change reported under the **after** name |
| `mixed/001-functional-and-layout` | canonical-flow | SelectValues | `field_property_changed` type String→None + `step_moved` (368/384 → 368/320) | functional + layout | SelectValues + generic | active | |
| `xml/001-unknown-property-added` | canonical-flow | SelectValues | `unknown_change` element `ktrdiff_demo_flag` = "demo" under `<step>` | unknown | generic | active | hand-edited file (no `info/*` noise) yet `manually_edited: false` — see issue 3 |
| `invalid/001-invalid-xml` | canonical-flow | — | `result: error`, `error_code: invalid_xml` | — | — | active | after file is plain text, 33 bytes |

## Missing vs. the MVP wish list

The task description mentions `notes/001-note-added`; **no `notes/` fixture exists in the repository**. Note comparison is implemented and covered by unit tests instead of a golden fixture.

## Observed KTR structural facts driving the design

* Spoon 9.4 **reorders `<step>` elements alphabetically** on save → collections must be matched by name, never by XML order.
* Every Spoon re-save rewrites `info/name` (= file name), `info/directory`, `info/modified_date`, and materializes `key_for_session_key` → these are *volatile storage properties*: detected, classified `metadata`, flagged volatile, excluded from strict fixture counting.
* Step names may contain trailing newlines (`Read Demo Customers\n` in sql-flow); hop `from`/`to` carry the same raw string → names are trimmed for identity purposes, raw values preserved for rendering.
* Spoon may add empty elements on re-save (`<row-meta/>` in TableInput) → an element with no attributes, no children and empty text is normalized as equivalent to an absent element.
* Step type IDs observed: `RowGenerator`, `SelectValues`, `FilterRows`, `Dummy`, `TableInput`, `ScriptValueMod`.
* Inline `<connection>` blocks contain `<password>` (`Encrypted …`) → central secret redaction applies.
