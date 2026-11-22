# Step matching

Rename recognition is a hard requirement: the engine must never confuse
`step removed + step added` with `step renamed`, and hops must never falsely change because a
step's name changed. This document is the specification of `it.ktrdiff.core.match`.

## Pipeline

```
1. name pass          same trimmed name  → same logical step (whatever the content)
2. fingerprint pass   identical semantic content, different name → exact rename
3. similarity pass    unique high-score pair of same type → rename with modification
4. leftovers          step_removed / step_added
```

Matched pairs share a **logical id**; hop endpoints are resolved through logical ids on both
sides, so a rename leaves every hop key identical (verified by unit tests and the
`steps/003`/`steps/004` fixtures).

## Pass 1 — name

Trimmed names (`Read Demo Customers\n` in real files ⇒ `Read Demo Customers`). If the types
differ, the step keeps its identity and a critical `step_property_changed property=type`
(functional) is emitted; the two configurations are not compared field-by-field because they
belong to different plugins.

## Pass 2 — exact fingerprint

`SHA-256(canonical(step subtree) excluding <name> and <GUI>)` — canonicalization normalizes
newlines/indentation and collapses semantically empty elements, so layout, XML formatting and
the name carry zero weight. Equal fingerprints on both sides = exact rename (`confidence 1.0`).
Multiple identical steps renamed at once pair by name order: any pairing of identical content
is semantically equivalent, and determinism wins.

## Pass 3 — similarity (iterative)

Only pairs with the same canonical type (aliases resolved via `StepTypeAliases`) are scored:

```
score = 0.58 · config + 0.21 · structure + 0.11 · position + 0.10 · name
```

* **config** — semantic-text aware. Large text leaves (SQL, script bodies — anything multiline
  or > 40 chars) compare as token sets; all other leaves as `path=value` entries; the two
  Jaccards blend 50/50 when text exists. Without the split, shared boilerplate
  (`limit=0`, `distribute=Y`, same connection…) drowns the discriminating content and makes
  every TableInput look ~25% similar to every other.
* **structure** — Jaccard over *anchored* neighbours only (steps already matched by earlier
  passes/rounds). An unmatched neighbour is **unknown, not different**, so it is excluded;
  when neither side has an anchored neighbour the signal falls back to in/out degree
  closeness (two isolated steps score 1).
* **position** — weak: `max(0, 1 − distance/800px)`; 0.5 when unknown.
* **name** — bigram Dice similarity, deliberately tiny (the spec demands names weigh little):
  it only breaks ties between content-similar candidates, it can never create a match alone.

The pass runs in **rounds** (up to 12): each round accepts only unique above-threshold pairs,
accepted pairs become anchors, and the next round re-scores the remainder with the sharper
structure signal — so matches cascade along hop chains even when *every* step in the
transformation was renamed (a real-world full-rework case is covered by tests). A step that
ever lands in an ambiguity stays removed/added permanently: the engine never guesses.

Threshold: **0.70** default (recalibrated for the richer score; the old scale maxed out at
0.75 for fully-renamed graphs), configurable via `matching.rename_threshold` in `.ktrdiff.yml`
or `renameThreshold` in the API. Selection is greedy over candidates sorted by score (name
tie-breaks) — a candidate is accepted only if **unique**: any rival sharing an endpoint within
`0.05` makes the whole group ambiguous.

## Near-miss diagnostics

Steps left unmatched record their closest below-threshold candidate as a `near-miss`
matching decision (visible in Advanced mode and in the JSON `matchingDecisions`), e.g.
"removed step *Requests* resembles added step *RequestsFromOrders* (0.53)". This surfaces
role-replacements that are genuinely too different to pair automatically — for example a new
TableInput whose SQL merges two old ones: content similarity ties the candidates, and picking
one would be a coin flip presented as fact.

## Ambiguity

Ambiguous candidates stay `step_removed` + `step_added`, produce an `ambiguous_step_match`
warning listing candidates and scores, and appear in `matchingDecisions` (visible in Advanced
mode and in the JSON output). The engine never picks arbitrarily.

## Worked example (steps/004)

`Select Customer Fields` → `Normalize Customer Fields` with meta length 20→50:
~120 leaf properties, 2 differ ⇒ config ≈ 0.98; neighbours identical ⇒ 1.0; same position ⇒ 1.0;
score ≈ 0.99 ⇒ unique rename. Output: `step_renamed` (confidence 0.982) **plus**
`field_property_changed CUSTOMER_CODE length 20→50` reported under the after name — and zero
hop changes.

## Determinism and complexity

Candidates are grouped by type before scoring (m·n pairs per type group, not per document);
every ordering has an explicit comparator; the same inputs always produce the same ChangeSet
(covered by a byte-equality test on the JSON output and a concurrency test).
