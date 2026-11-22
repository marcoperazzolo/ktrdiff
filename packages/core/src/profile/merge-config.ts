// it.ktrdiff.core.profile.ConfigLoader.merge — merges a parsed YAML/JSON tree (a plain value, as
// produced by JSON.parse or a YAML parser) into a config. Reading files is the CLI's job
// (packages/cli config-files.ts); core never sees YAML text.
//
// The Java code reads a Jackson JsonNode; the helpers below replicate the JsonNode coercions it
// relies on (`hasNonNull`, `asBoolean`, `asText`, `asDouble`, `asLong`) for plain JS values.

import { classificationFromId } from '../model/change.ts';
import { javaDoubleToString, javaTrim } from '../util/java.ts';
import { modeFromId, type DiffConfig } from './diff-config.ts';

type Plain = unknown;

function isObject(node: Plain): node is Record<string, Plain> {
  return typeof node === 'object' && node !== null && !Array.isArray(node);
}

/** JsonNode.get(name): only object nodes have fields; null stands for "missing". */
function get(node: Plain, name: string): Plain | undefined {
  if (!isObject(node) || !Object.prototype.hasOwnProperty.call(node, name)) return undefined;
  return node[name];
}

/** JsonNode.hasNonNull(name). */
function hasNonNull(node: Plain, name: string): boolean {
  const v = get(node, name);
  return v !== undefined && v !== null;
}

/**
 * JsonNode.asBoolean(): booleans as is; text "true"/"false" after trim; integral numbers are
 * true when non-zero; floating-point numbers, containers and null default to false. JS cannot
 * tell `1.0` from `1`, so integral-valued numbers are treated as Jackson IntNode/LongNode.
 */
function asBoolean(v: Plain): boolean {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'string') return javaTrim(v) === 'true';
  if (typeof v === 'number') return Number.isInteger(v) ? v !== 0 : false;
  return false;
}

/** JsonNode.asText(): containers give "", null gives "null", numbers their Java text. */
function asText(v: Plain): string {
  if (typeof v === 'string') return v;
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : javaDoubleToString(v);
  if (v === null || v === undefined) return 'null';
  return '';
}

/** JsonNode.asDouble(): numbers as is, booleans 1/0, text via NumberInput.parseAsDouble (0 on failure). */
function asDouble(v: Plain): number {
  if (typeof v === 'number') return v;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (typeof v === 'string') return parseAsDouble(v) ?? 0;
  return 0;
}

/** JsonNode.asLong(): numbers truncated like a `(long)` cast, booleans 1/0, text via parseAsLong. */
function asLong(v: Plain): number {
  if (typeof v === 'number') return toLong(v);
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (typeof v === 'string') return parseAsLong(v);
  return 0;
}

function toLong(d: number): number {
  return Number.isNaN(d) ? 0 : Math.trunc(d);
}

/**
 * `Double.parseDouble` on the trimmed text: decimal with optional exponent and [fFdD] suffix,
 * NaN, Infinity. Hexadecimal floating-point literals are not supported (they yield the default).
 */
function parseAsDouble(s: string): number | null {
  const t = javaTrim(s);
  if (t.length === 0) return null;
  const m = /^([+-]?)(NaN|Infinity|(?:[0-9]+\.?[0-9]*|\.[0-9]+)(?:[eE][+-]?[0-9]+)?)[fFdD]?$/.exec(t);
  if (m === null) return null;
  const body = m[2]!;
  if (body === 'NaN') return NaN;
  const value = body === 'Infinity' ? Infinity : Number(body);
  return m[1] === '-' ? -value : value;
}

const LONG_MIN = -(2n ** 63n);
const LONG_MAX = 2n ** 63n - 1n;

/** NumberInput.parseAsLong: integer text, else `(long) parseDouble`, else 0. */
function parseAsLong(s: string): number {
  let t = javaTrim(s);
  if (t.length === 0) return 0;
  if (t.charAt(0) === '+') t = t.substring(1);
  if (!/^-?[0-9]+$/.test(t)) {
    const d = parseAsDouble(t);
    return d === null ? 0 : toLong(d);
  }
  const big = BigInt(t);
  return big < LONG_MIN || big > LONG_MAX ? 0 : Number(big);
}

/**
 * ConfigLoader.merge(config, root) returning a new config. Unknown keys are ignored; an unknown
 * mode or classification throws like the Java IllegalArgumentException. Size arithmetic uses JS
 * numbers (exact up to 2^53 bytes, far beyond any accepted limit).
 */
export function mergeConfig(base: DiffConfig, root: unknown): DiffConfig {
  if (root === null || root === undefined) return base;
  let config: DiffConfig = { ...base, include: { ...base.include } };
  if (hasNonNull(root, 'mode')) {
    config = { ...config, mode: modeFromId(asText(get(root, 'mode'))) };
  }
  const include = get(root, 'include');
  if (isObject(include)) {
    const next = { ...config.include };
    for (const key of Object.keys(include)) {
      next[classificationFromId(key.replaceAll('_', '-'))] = asBoolean(include[key]);
    }
    config = { ...config, include: next };
  }
  const layout = get(root, 'layout');
  if (hasNonNull(layout, 'step_positions')) {
    config = { ...config, layoutStepPositions: asBoolean(get(layout, 'step_positions')) };
  }
  if (hasNonNull(layout, 'note_positions')) {
    config = { ...config, layoutNotePositions: asBoolean(get(layout, 'note_positions')) };
  }
  const notes = get(root, 'notes');
  if (hasNonNull(notes, 'content')) {
    config = { ...config, notesContent: asBoolean(get(notes, 'content')) };
  }
  const sql = get(root, 'sql');
  if (hasNonNull(sql, 'ignore_formatting')) {
    config = { ...config, sqlIgnoreFormatting: asBoolean(get(sql, 'ignore_formatting')) };
  }
  const scripts = get(root, 'scripts');
  if (hasNonNull(scripts, 'ignore_whitespace')) {
    config = { ...config, scriptsIgnoreWhitespace: asBoolean(get(scripts, 'ignore_whitespace')) };
  }
  const output = get(root, 'output');
  if (hasNonNull(output, 'show_xml_paths')) {
    config = { ...config, showXmlPaths: asBoolean(get(output, 'show_xml_paths')) };
  }
  if (hasNonNull(output, 'show_raw_diff')) {
    config = { ...config, showRawDiff: asBoolean(get(output, 'show_raw_diff')) };
  }
  const matching = get(root, 'matching');
  if (hasNonNull(matching, 'rename_threshold')) {
    config = { ...config, renameThreshold: asDouble(get(matching, 'rename_threshold')) };
  }
  const renames = get(root, 'renames');
  if (hasNonNull(renames, 'show')) {
    config = { ...config, showRenames: asBoolean(get(renames, 'show')) };
  }
  if (hasNonNull(root, 'fail_on')) {
    config = { ...config, failOn: asText(get(root, 'fail_on')) };
  }
  const limits = get(root, 'limits');
  if (hasNonNull(limits, 'max_file_mb')) {
    config = { ...config, maxFileBytes: asLong(get(limits, 'max_file_mb')) * 1024 * 1024 };
  }
  return config;
}
