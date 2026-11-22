// Comparison of TypeScript outputs with the recorded oracle outputs. Pure (no I/O), so both the
// core and the CLI parity tests can use it. Differences are only allowed through the transforms
// registered below by the ID of their entry in docs/parity.md, each scoped to the narrowest path.

export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

export type DifferenceKind = 'changed' | 'missing' | 'extra' | 'type' | 'length';

export interface Difference {
  /** JSON path (`$.files[0].status`) or `line N` for text outputs. */
  path: string;
  kind: DifferenceKind;
  expected?: unknown;
  actual?: unknown;
}

/** A documented intentional difference, applied to both sides before comparing. */
export interface JsonTransform {
  id: string;
  /** Output file names it applies to (e.g. `advanced.json`). */
  outputs: readonly string[];
  apply(value: Json): Json;
}

export interface TextTransform {
  id: string;
  outputs: readonly string[];
  apply(text: string): string;
}

const isObject = (v: Json | undefined): v is { [key: string]: Json } =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const typeOf = (v: Json): string => (v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v);

const childPath = (path: string, key: string): string =>
  /^[A-Za-z_$][\w$]*$/.test(key) ? `${path}.${key}` : `${path}[${JSON.stringify(key)}]`;

/**
 * Deep comparison: object key sets must match, arrays are compared index by index (order is
 * significant: the engine output order is part of parity) and numbers must be exactly equal.
 */
export function compareJson(expected: Json, actual: Json, path = '$'): Difference[] {
  if (typeOf(expected) !== typeOf(actual)) {
    return [{ path, kind: 'type', expected, actual }];
  }
  if (Array.isArray(expected) && Array.isArray(actual)) {
    const diffs: Difference[] = [];
    if (expected.length !== actual.length) {
      diffs.push({ path, kind: 'length', expected: expected.length, actual: actual.length });
    }
    const common = Math.min(expected.length, actual.length);
    for (let i = 0; i < common; i++) diffs.push(...compareJson(expected[i]!, actual[i]!, `${path}[${i}]`));
    return diffs;
  }
  if (isObject(expected) && isObject(actual)) {
    const diffs: Difference[] = [];
    for (const key of Object.keys(expected)) {
      if (!Object.hasOwn(actual, key)) diffs.push({ path: childPath(path, key), kind: 'missing', expected: expected[key] });
      else diffs.push(...compareJson(expected[key]!, actual[key]!, childPath(path, key)));
    }
    for (const key of Object.keys(actual)) {
      if (!Object.hasOwn(expected, key)) diffs.push({ path: childPath(path, key), kind: 'extra', actual: actual[key] });
    }
    return diffs;
  }
  return expected === actual ? [] : [{ path, kind: 'changed', expected, actual }];
}

/** Byte comparison of text outputs; reports the first differing line (1-based). */
export function compareText(expected: string, actual: string): Difference[] {
  if (expected === actual) return [];
  const e = expected.split('\n');
  const a = actual.split('\n');
  for (let i = 0; i < Math.max(e.length, a.length); i++) {
    if (e[i] !== a[i]) return [{ path: `line ${i + 1}`, kind: 'changed', expected: e[i], actual: a[i] }];
  }
  return [{ path: 'line ?', kind: 'changed' }];
}

function mapErrors(value: Json, fn: (error: { [key: string]: Json }) => Json): Json {
  if (Array.isArray(value)) return value.map((v) => mapErrors(v, fn));
  if (!isObject(value)) return value;
  const out: { [key: string]: Json } = {};
  for (const [key, v] of Object.entries(value)) {
    out[key] = key === 'errors' && Array.isArray(v)
      ? v.map((e) => (isObject(e) ? fn(e) : e))
      : mapErrors(v, fn);
  }
  return out;
}

const JSON_OUTPUTS = ['advanced.json', 'quick.json', 'directory.advanced.json', 'directory.quick.json'];

/** Registered JSON transforms, by docs/parity.md entry. */
export const JSON_TRANSFORMS: readonly JsonTransform[] = [
  {
    // D1: XML parse error messages are Xerces wording; only code and side must match.
    id: 'D1',
    outputs: JSON_OUTPUTS,
    apply: (value) => mapErrors(value, (error) => {
      if (error['code'] !== 'invalid_xml') return error;
      const { message: _message, ...rest } = error;
      return rest;
    }),
  },
  {
    // D2: the TypeScript directory JSON adds files[].summary.
    id: 'D2',
    outputs: ['directory.advanced.json', 'directory.quick.json'],
    apply: (value) => {
      if (!isObject(value) || !Array.isArray(value['files'])) return value;
      return {
        ...value,
        files: value['files'].map((file) => {
          if (!isObject(file)) return file;
          const { summary: _summary, ...rest } = file;
          return rest;
        }),
      };
    },
  },
  {
    // D8: SQL and script body changes carry the whole before/after text (Java left them null).
    id: 'D8',
    outputs: JSON_OUTPUTS,
    apply: (value) => mapChanges(value, (c) =>
      TEXT_BODY_CHANGES.has(`${String(c['kind'])}/${String(c['property'])}`) ? { ...c, before: null, after: null } : c),
  },
];

const TEXT_BODY_CHANGES = new Set(['sql_changed/query', 'sql_changed/formatting', 'script_changed/source', 'script_changed/whitespace']);

/** Applies fn to every change object (anything with a string `kind` and `classification`), at any depth. */
function mapChanges(value: Json, fn: (change: { [key: string]: Json }) => Json): Json {
  if (Array.isArray(value)) return value.map((v) => mapChanges(v, fn));
  if (!isObject(value)) return value;
  const out: { [key: string]: Json } = {};
  for (const [key, v] of Object.entries(value)) out[key] = mapChanges(v, fn);
  return typeof out['kind'] === 'string' && typeof out['classification'] === 'string' ? fn(out) : out;
}

/** Registered text transforms (stdout/stderr of the CLI), by docs/parity.md entry. */
export const TEXT_TRANSFORMS: readonly TextTransform[] = [
  {
    // D1: the message after an `[invalid_xml]` code is Xerces wording.
    id: 'D1',
    outputs: ['inspect.txt', 'validate.txt', 'inspect.before.txt', 'inspect.after.txt', 'stderr'],
    apply: (text) => text.replace(/\[invalid_xml\]: [^\n]*/g, '[invalid_xml]: <message>'),
  },
  {
    // D1 in the compare reports: text prints `[invalid_xml] (side) message`, HTML prints
    // `<code>invalid_xml</code> <em>(side)</em> message</li>`; the side stays compared.
    id: 'D1',
    outputs: ['advanced.txt', 'quick.txt', 'advanced.html'],
    apply: (text) => text
      .replace(/^( {2}\[invalid_xml\](?: \((?:before|after)\))? )[^\n]*/gm, '$1<message>')
      .replace(/(<code>invalid_xml<\/code>(?: <em>\((?:before|after)\)<\/em>)? )[^<\n]*<\/li>/g, '$1<message></li>'),
  },
];

export function applyJsonTransforms(output: string, value: Json,
  transforms: readonly JsonTransform[] = JSON_TRANSFORMS): Json {
  return transforms.filter((t) => t.outputs.includes(output)).reduce((v, t) => t.apply(v), value);
}

export function applyTextTransforms(output: string, text: string,
  transforms: readonly TextTransform[] = TEXT_TRANSFORMS): string {
  return transforms.filter((t) => t.outputs.includes(output)).reduce((v, t) => t.apply(v), text);
}

/** Compares one recorded output with the TypeScript one, after the registered transforms. */
export function compareOutput(output: string, expected: string, actual: string): Difference[] {
  if (output.endsWith('.json')) {
    return compareJson(
      applyJsonTransforms(output, JSON.parse(expected) as Json),
      applyJsonTransforms(output, JSON.parse(actual) as Json),
    );
  }
  return compareText(applyTextTransforms(output, expected), applyTextTransforms(output, actual));
}

/**
 * Human-readable report. Values are printed only for public cases: for private cases (real
 * documents) the report names the case and the paths, never the content.
 */
export function formatDifferences(caseId: string, output: string, diffs: readonly Difference[],
  showValues: boolean): string {
  const lines = diffs.map((d) => {
    const head = `  ${d.kind.padEnd(7)} ${d.path}`;
    if (!showValues) return head;
    return `${head}: expected ${JSON.stringify(d.expected)}, actual ${JSON.stringify(d.actual)}`;
  });
  return [`${caseId} ${output}: ${diffs.length} difference(s)`, ...lines].join('\n');
}
