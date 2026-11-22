# Fixture issues

Problems found while inspecting `fixtures/` during Phase 0 (2026-07-14).
Per project rules the fixture files (`.ktr` and `expected.yml`) were **not** modified.
Affected golden tests are quarantined via `fixtures-known-issues.yml` at the repository
root; the fixture runner reports them as `KNOWN-ISSUE` (never as silent passes).

## Issue 1 — `steps/001-step-added` and `steps/002-step-removed`: swapped and inconsistent expected.yml

**Files:**
* `fixtures/steps/001-step-added/expected.yml` — declares `id: steps-002`, title "Rejected Rows step removed", changes `step_removed` (Rejected Rows) + `hop_removed` (Filter Valid Customers → Rejected Rows).
* `fixtures/steps/002-step-removed/expected.yml` — declares `id: steps-001`, title "Unconnected Dummy step added", change `step_added` with `step_name`/`after_name` = **"Audit Rows"**.

**Observed KTR content:**
* `steps/001-step-added` before→after actually **adds** a Dummy step named **"Dummy (do nothing)"** (no hops touched).
* `steps/002-step-removed` before→after actually **removes** step "Rejected Rows" and the hop "Filter Valid Customers → Rejected Rows".

**Why it is inconsistent:** each `expected.yml` describes the KTR pair of the *other* directory (ids crossed). Even if the two files were swapped back, `steps/001-step-added` would still fail: its expectation names the added step "Audit Rows" while the KTR contains "Dummy (do nothing)" (the step was evidently never renamed in Spoon).

**Action taken:** both fixtures quarantined with reasons in `fixtures-known-issues.yml`; step-added / step-removed (+hop) detection is covered by unit tests in `ktrdiff-core` on synthetic transformations. A maintainer can heal the fixtures by swapping the two `expected.yml` files and either renaming the added step to "Audit Rows" in Spoon or fixing the expected names — a decision deliberately left to a human because it requires editing fixture sources of truth.

**Update (2026-07-18):** the maintainer healed the swap (commit `75ac636 "Fix expected.yml"`);
`steps/002-step-removed` now passes and left the quarantine. `steps/001-step-added` remains
quarantined for the second half of the issue: its (now correct) expectation names the added
step "Audit Rows" while the KTR pair adds "Dummy (do nothing)". Lifting it requires renaming
the step inside `after/canonical-flow.ktr` (ideally via Spoon) or aligning the expected name.

## Issue 2 — `scripts/001-script-line-changed`: step type name mismatch

`expected.yml` uses `step_type: "ModifiedJavaScriptValue"`, while the KTR files contain
`<type>ScriptValueMod</type>` (the real Pentaho step ID; "Modified Java Script Value" is the
Spoon display name). Handled generically: the engine always reports the raw XML type
(`ScriptValueMod`) and step-type comparison (fixture matcher and adapter dispatch) goes
through a small documented alias table (`StepTypeAliases`) mapping known Pentaho display-name
variants to their IDs. Not quarantined — passes via the alias.

## Issue 3 — `xml/001-unknown-property-added`: `manually_edited: false` but file is hand-edited

The after file differs from before *only* by the added `<ktrdiff_demo_flag>` line — no
`info/name`, `info/directory` or `modified_date` rewrite, which Spoon always performs on save.
The file was therefore edited by hand, while the metadata says `manually_edited: false`.
Harmless for the engine; recorded for accuracy only. Not quarantined.

## Issue 4 — `scripts/001` internal directory says `001-normalization-changed`

`after/script-flow.ktr` contains `<directory>/fixtures/scripts/001-normalization-changed</directory>`
while the folder is named `001-script-line-changed` (the case was evidently renamed after saving).
`info/directory` is a volatile storage property, so this has no effect on the tests. Informational.

## Issue 5 — every Spoon-saved `after` file carries storage noise

All Spoon-saved fixtures (all except `xml/001` and `basic/001`) differ in
`info/name` (seed name → "after"), `info/directory`, `info/modified_date`, and
`key_for_session_key` (empty → `H4sIAAAA…`), yet declare `strict: true` with `allow_extra: []`.
The only interpretation compatible with the fixtures-as-truth rule is that these Spoon
save artifacts are not "semantically declared changes". The engine therefore detects them,
classifies them as `metadata`, marks them `volatile: true`, and the fixture matcher and strict
counting ignore volatile changes. They stay visible in Advanced mode. Documented in
[matching.md](matching.md) and `VolatileProperties` in the core.

## Issue 6 — `fixture-seeds/expected-template.yml` is not valid YAML

The template ends with a plain-text "Regole pratiche" numbered list outside any YAML
structure, so the file as a whole does not parse as YAML. It is documentation, not a
fixture, so nothing depends on it; noted to avoid pointing a YAML validator at it.

## Issue 7 — no `notes/` fixture

The MVP fixture wish list mentions `notes/001-note-added`, but no such fixture exists in the
repository. Note comparison (`note_added`/`note_removed`/`note_changed`/`note_moved`) is
implemented and covered by unit tests on synthetic transformations instead.
