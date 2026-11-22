# Parity with the v0.2.0 Java engine

The TypeScript engine must produce the same outputs as the Java CLI built from tag `v0.2.0` (the
oracle, see `parity/reference/ORACLE.md`). This file lists what the oracle does on the edge cases
and, later in phase 1, every intentional difference (D-xx), every Java bug found while porting
(B-xx) and the `HashMap`/`HashSet` iteration audit.

## Probes

Synthetic inputs under `parity/probes/` (no real content), recorded by `npm run oracle:record`
into `parity/reference/probes/`:

| Group | Kind | Cases |
|---|---|---|
| `malformed/` | single document (`doc.ktr`) | XML well-formedness and limit cases, encoding edge cases |
| `wellformed/` | single document (`doc.ktr`) | line ends, attributes, CDATA, comments/PIs, names with whitespace or non-ASCII |
| `pairs/` | document pair (`before.*`/`after.*`) | KJB, KDB, SQL/script edits, renames, ambiguity, secrets, XML-level equivalences |
| `directories/` | directory pair (`before/`/`after/`) | path pairing, moves, semantic and ambiguous renames, added/removed, unparsable and unsupported files |

## XML verdicts of the oracle (Xerces)

`validate doc.ktr` on each `malformed/` probe. Exit 2 with `invalid_xml` means the XML layer
rejected the document; messages are Xerces wording (D1: only code and side must match).

| Probe | Exit | Code | Oracle message (abridged) |
|---|---|---|---|
| `doctype` | 2 | `invalid_xml` | DOCTYPE is disallowed |
| `internal-entity-decl` | 2 | `invalid_xml` | DOCTYPE is disallowed |
| `external-entity` | 2 | `invalid_xml` | DOCTYPE is disallowed |
| `undefined-entity` | 2 | `invalid_xml` | entity "undefined" was referenced, but not declared |
| `bare-ampersand` | 2 | `invalid_xml` | entity name must immediately follow the '&' |
| `mismatched-tag` | 2 | `invalid_xml` | element type "b" must be terminated by the matching end-tag |
| `unclosed-tag` | 2 | `invalid_xml` | structures must start and end within the same entity |
| `duplicate-attribute` | 2 | `invalid_xml` | attribute "a" was already specified |
| `lt-in-attribute` | 2 | `invalid_xml` | attribute value must not contain '<' |
| `cdata-end-in-text` | 2 | `invalid_xml` | "]]>" must not appear in content |
| `char-ref-1` | 2 | `invalid_xml` | character reference "&#1" is an invalid XML character |
| `raw-u0001` | 2 | `invalid_xml` | invalid XML character (Unicode: 0x1) |
| `two-roots` | 2 | `invalid_xml` | markup following the root element must be well-formed |
| `text-after-root` | 2 | `invalid_xml` | content is not allowed in trailing section |
| `no-root` | 2 | `invalid_xml` | premature end of file |
| `depth-200` | 2 | `invalid_ktr` | XML accepted (depth 200 is within the limit); rejected later: no `<info>` |
| `depth-201` | 2 | `invalid_xml` | exceeds the maximum element depth of 200 |
| `unterminated-comment` | 2 | `invalid_xml` | structures must start and end within the same entity |
| `unterminated-cdata` | 2 | `invalid_xml` | structures must start and end within the same entity |
| `xml-decl-not-first` | 2 | `invalid_xml` | PI target matching "[xX][mM][lL]" is not allowed |
| `leading-bom` | 2 | `invalid_xml` | content is not allowed in prolog |
| `encoding-iso-8859-1` | 0 | — | accepted: the declaration is ignored, bytes are decoded as UTF-8 |
| `invalid-utf8-byte` | 0 | — | accepted: the invalid byte becomes U+FFFD |
| `empty-whitespace` | 2 | `invalid_xml` | Empty document |

Every `wellformed/` probe is accepted (exit 0).

### BOM decision (D6)

The oracle decodes bytes with `new String(bytes, UTF_8)`, which keeps a leading BOM as U+FEFF,
and Xerces then rejects it as content in the prolog. Following the phase rule "replicate first,
fix at the end of the phase", the TypeScript tokenizer **replicates the rejection** for now, so
there is no D6 yet. Rejecting a BOM-prefixed UTF-8 file is likely a Java bug: it is a candidate
B-xx for step I2, where the owner decides whether to accept it (that would become D6).

## Intentional differences (D-xx)

Applied by `parity/lib/compare.ts` (transforms registered by ID) to both sides before comparing,
each limited to the outputs listed.

| ID | Difference | Transform | Outputs |
|---|---|---|---|
| D1 | XML parse error messages (Xerces wording) differ; code and side are equal | JSON: drop `message` of every `errors[]` entry whose `code` is `invalid_xml`; text: replace the text after `[invalid_xml]: ` | `*.json`; `inspect*.txt`, `validate.txt`, stderr; compare reports `advanced.txt`, `quick.txt` (`[invalid_xml] (side) ` prefix kept) and `advanced.html` (`<code>invalid_xml</code> <em>(side)</em> ` kept) |
| D2 | Directory JSON gains `files[].summary` (since G2: entity counts of the changes visible in the requested mode, placed between `method` and `comparison`) | drop `files[].summary` | `directory.*.json` |
| D3 | New element-count limit (default 1,000,000) -> `invalid_xml` | none: no probe or fixture reaches it; its probe is TS-only | — |
| D4 | CLI help, usage, version text and argument-error messages (picocli) | not recorded; exit codes still compared | — |
| D5 | JSON whitespace (Jackson pretty printer `"key" : value`) | JSON is always compared parsed, never as bytes | `*.json` |
| D6 | `git-install` writes `node "<absolute path of the CLI script>"` instead of `ktrdiff` (there is no installed `ktrdiff` launcher), and prints the `git config` lines POSIX-quoted | not recorded | — |
| D7 | `duplicate_step_names` message: with two or more duplicated names they are listed in first-duplicate document order (Java joined a `HashSet`, so hash-bucket order; was B1) | none: identical with one duplicated name, and no fixture, probe or private case has more | `*.json`, text and HTML reports of such documents |
| D8 | `sql_changed` and `script_changed` body changes (`query`, `formatting`, `source`, `whitespace`) carry the whole normalized before/after text in `before`/`after` (Java left them null), so the web app can show the text with its changed words; text and HTML reports still print only the changed lines | JSON: set `before`/`after` of those changes to null | `*.json` |

## Java bugs found while porting (B-xx)

Each entry is replicated first and fixed in step I2, where it becomes a D-xx entry. An entry that
cannot be replicated without emulating `String.hashCode` buckets is made deterministic right away.

| ID | Bug | Status in the TypeScript port |
|---|---|---|
| B1 | `KtrParser`: the `duplicate_step_names` message joins a `HashSet`, so with two or more duplicated names their order depends on hash buckets | fixed in I2: now D7 (first-duplicate document order, pinned by a parser unit test) |

The private cases of step I1 found no further bug (0 differing outputs).

## HashMap / HashSet iteration audit

Filled in by steps E2 (`match/`, `normalize/`) and F3b (`engine/`): for each Java `HashMap` or
`HashSet` iteration, whether its order can reach an output and how the TypeScript port makes it
explicit.

| Java site | Iteration reaches output? | TypeScript handling |
|---|---|---|
| `parser/KtrParser` `duplicates` (`HashSet`) | yes: `duplicate_step_names` message | first-duplicate document order (B1) |
| `parser/KtrParser` `seen` (`HashSet`) | no: membership only | `Set` |
| `normalize/SemanticStep.project` `names` (`HashSet`) | no: uniqueness test only | `Set` |
| `normalize/VolatileProperties` `INFO_PROPERTIES` (`HashSet`) | no: membership only | `Set` |
| `match/StepTypeAliases` `ALIASES` (`HashMap`) | no: lookup only | `Map` |
| `match/Similarity` `Props` sets, `jaccard`, `bigrams`, `anchoredNeighbourTokens` (`HashSet`) | no: only sizes and membership feed the score | `Set`; intersection/union counted, never iterated into output |
| `match/Similarity.collect` `indices` (`HashMap`) | no: per-name counter | `Map` |
| `match/StepMatcher` `beforeAnchors`/`afterAnchors` (`HashMap`) | no: lookup only | `Map` |
| `match/StepMatcher` `ambiguous`/`consumed` (`HashSet`), `removeAll(consumed)` | no: membership only; `removeAll` keeps list order | `Set` (identity, like `StepModel` without `equals`); `filter` keeps order |
| `match/StepMatcher` `FINGERPRINT_EXCLUDES` (`HashSet`) | unused by the matcher (pass 2 groups by `SemanticStep.signature`) | not ported |
| `engine/DiffEngine.logicalIdsByName` (`HashMap`) | no: lookups only (hop keys, graph hop keys, `hopXml`); a `null` endpoint name misses the map and concatenates as `"null"` | `Map` + explicit `"null"` in `compare-root.ts` |
| `engine/DirectoryDiffEngine.compare` `signatures` (`HashMap`) | no: lookup only | `Map` |
| `engine/DirectoryDiffEngine.signature` `placeholders`/`identities` (`HashMap`) | no: lookups only; `parts` is sorted before hashing | `Map`; `parts` sorted with `compareUtf16` |

`engine/DiffEngine` and `engine/XmlFallback` otherwise iterate only lists, `LinkedHashMap`s and
`LinkedHashSet`s, ported as arrays and insertion-ordered `Map`/`Set` (re-`put` keeps the first
position in both). `engine/DirectoryDiffEngine` iterates its inputs through `TreeMap`s (ported
as `Map`s rebuilt in `compareUtf16` key order) and `LinkedHashMap` groups built from them; the
final file list is sorted by after path, else before path. The signature hash is compared for
equality only, so its encoding never reaches output.

`match/` and `normalize/` iterate only lists and `LinkedHashMap`s (`afterByName`, signature
groups), ported as arrays and insertion-ordered `Map`s. `packages/core/test/match-parity.test.ts`
checks `matchingDecisions` (methods, names, details, exact scores) against every recorded pair.

## Other oracle behaviour

Other inspect behaviour worth knowing: `inspect` exits 2 with `unsupported_document` on KJB and
KDB documents (it only supports transformations); a directory pair with an unparsable file exits 2.
