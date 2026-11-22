// The Jackson JsonNode accessors the Java fixture tooling uses (`path(..).asText(default)`,
// `asBoolean(default)`, `asInt(default)`), over plain values parsed by `yaml` in YAML 1.1 mode.

import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import { javaTrim } from '../java.ts';

export type Node = unknown;

export function readYamlFile(file: string): Node {
  return parse(readFileSync(file, 'utf8'), { version: '1.1' });
}

const isObject = (n: Node): n is Record<string, Node> => typeof n === 'object' && n !== null && !Array.isArray(n);

/** JsonNode.get / path: a field of an object node, undefined when missing. */
export function field(node: Node, name: string): Node {
  return isObject(node) && Object.hasOwn(node, name) ? node[name] : undefined;
}

const isScalar = (n: Node): n is string | number | boolean =>
  typeof n === 'string' || typeof n === 'number' || typeof n === 'boolean';

/** asText(default): missing and null give the default, containers give "". */
export function asText(n: Node, defaultValue: string): string {
  if (n === undefined || n === null) return defaultValue;
  // Numbers: JS cannot tell 18.0 from 18; Java would print the double form. Only failure
  // messages and ids are affected, and no expected.yml uses floating-point identifiers.
  return isScalar(n) ? String(n) : '';
}

/** asBoolean(default): booleans, "true"/"false" text, integral numbers (non-zero); else default. */
export function asBoolean(n: Node, defaultValue: boolean): boolean {
  if (typeof n === 'boolean') return n;
  if (typeof n === 'number') return Number.isInteger(n) ? n !== 0 : defaultValue;
  if (typeof n === 'string') {
    const t = javaTrim(n);
    if (t === 'true') return true;
    if (t === 'false') return false;
  }
  return defaultValue;
}

/** asInt(default): numbers truncated, integer text parsed, else default. */
export function asInt(n: Node, defaultValue: number): number {
  if (typeof n === 'number') return Math.trunc(n);
  if (typeof n === 'boolean') return n ? 1 : 0;
  if (typeof n === 'string' && /^[+-]?[0-9]+$/.test(javaTrim(n))) return Number.parseInt(javaTrim(n), 10);
  return defaultValue;
}

export const isArray = (n: Node): n is Node[] => Array.isArray(n);

/** textOrNull: null for missing, null or empty text. */
export function textOrNull(n: Node): string | null {
  if (n === undefined || n === null) return null;
  const t = asText(n, '');
  return t.length === 0 ? null : t;
}

/** valueOrNull: booleans and numbers keep their type, everything else becomes text. */
export function valueOrNull(n: Node): string | number | boolean | null {
  if (n === undefined || n === null) return null;
  if (typeof n === 'boolean' || typeof n === 'number') return n;
  return asText(n, '');
}
