# Observed KTR structure (PDI 9.4.0.0-343)

Facts observed in the fixture corpus that drive parser/normalizer design. See also
[fixture-matrix.md](fixture-matrix.md) and [pentaho-version-support.md](pentaho-version-support.md).

## Document skeleton

```
<transformation>
  <info>            name, description, trans_type, directory, parameters, log tables,
                    maxdate, performance/monitoring settings, created/modified audit fields,
                    key_for_session_key
  <notepads>        <notepad> note text + xloc/yloc/width/heigth (misspelling is Pentaho's)
  <connection>*     inline DB connections (name, server, type, access, database, port,
                    username, password "Encrypted …", attributes list)
  <order>           <hop> from/to/enabled — endpoints reference step names as raw strings
  <step>*           name, type, distribute, copies, partitioning, type-specific config,
                    attributes, cluster_schema, remotesteps, GUI (xloc/yloc/draw)
  <step_error_handling>
  <slave-step-copy-partition-distribution/> <slave_transformation> <attributes/>
```

## Behavioural quirks that matter

* **Alphabetical step reordering**: Spoon 9.4 rewrites `<step>` blocks sorted by name on save —
  a text diff shows massive fake changes; collections must be matched by key, never by order.
* **Save noise**: every save rewrites `info/name` (= file name), `info/directory`,
  `info/modified_date` and materializes `key_for_session_key` (`H4sIAAAA…`).
* **Trailing newlines in names**: `<name>Read Demo Customers\n</name>` occurs in real files;
  hop `<from>` carries the same raw string. Identity must trim.
* **Empty elements appear spontaneously**: re-saving a TableInput adds `<row-meta/>`.
* **Numeric sentinels**: length/precision use `-1`/`-2` as "not set" depending on the tab.
* **SelectValues `<fields>`** mixes three collections (`field`, `remove`, `meta`) plus the
  scalar `select_unspecified` in one container; `type=None` on the Meta-data tab means "keep
  the incoming type".
* **FilterRows conditions** nest via `<compare><condition><conditions><condition>…` with
  `operator` on the non-first children; constant operands live in `<value>` blocks with
  type/text/mask.
* **ScriptValueMod** stores scripts in `<jsScripts><jsScript>` entries keyed by
  `jsScript_name`; the step ID is `ScriptValueMod` (display name "Modified Java Script Value").
* **Step type IDs observed**: RowGenerator, SelectValues, FilterRows, Dummy, TableInput,
  ScriptValueMod.
