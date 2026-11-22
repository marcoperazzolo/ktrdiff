// Small Java-semantics helpers shared by the engine modules (DiffEngine private statics).

import type { ChangeValue } from '../model/change.ts';
import { redactedCanonical } from '../normalize/normalizer.ts';
import { javaDoubleToString } from '../util/java.ts';
import type { XmlNode } from '../xml/xml-node.ts';

/**
 * `String.valueOf(Object)` for change values: comparators and XmlFallback coverage depend on it
 * ("null", "true", List.toString "[a, b]").
 */
export function javaValueOf(v: ChangeValue): string {
  if (v === null) return 'null';
  if (typeof v === 'string') return v;
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : javaDoubleToString(v);
  return '[' + v.join(', ') + ']';
}

/** DiffEngine.displayCanonical: redacted canonical form, "" for an absent node. */
export function displayCanonical(node: XmlNode | null): string {
  return node === null ? '' : redactedCanonical(node);
}
