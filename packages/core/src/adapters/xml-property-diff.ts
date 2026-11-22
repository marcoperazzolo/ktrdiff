// it.ktrdiff.core.adapters.XmlPropertyDiff — field/path-level comparison for documented plugin
// sections, not an XML execution engine.

import { change, type Change, type Classification } from '../model/change.ts';
import { canonical as canonicalOf, normalizeTrimmed, redactedCanonical } from '../normalize/normalizer.ts';
import { isSecretProperty, redact, REDACTED } from '../normalize/secret-redactor.ts';
import type { ComparisonContext } from '../engine/step-adapter.ts';
import type { XmlNode } from '../xml/xml-node.ts';
import { textDiff } from './text-diff.ts';

export function compareXmlProperty(b: XmlNode | null, a: XmlNode | null, section: string, property: string,
  classification: Classification, ctx: ComparisonContext, changes: Change[]): void {
  visit(b, a, section, property, null, classification, ctx, changes, false);
}

function visit(b: XmlNode | null, a: XmlNode | null, section: string, property: string, field: string | null,
  cls: Classification, ctx: ComparisonContext, changes: Change[], parentSecret: boolean): void {
  if (canonical(b) === canonical(a)) return;
  // canonical(null) is "", so at least one side is present here
  const n = (a ?? b)!;
  const secret = parentSecret || isSecretProperty(n.name)
    || isSecretProperty(n.childText('code')) || isSecretProperty(n.childText('name'));
  if (b === null || a === null) {
    emit(section, property, field, cls, ctx, changes, n.path, display(b, secret), display(a, secret));
    return;
  }
  const attrs = new Set<string>(b.attributes.keys());
  for (const k of a.attributes.keys()) attrs.add(k);
  for (const key of attrs) {
    const vb = b.attributes.get(key) ?? null;
    const va = a.attributes.get(key) ?? null;
    if (vb !== va) {
      emit(section, property + '/@' + key, field, 'unknown', ctx, changes, n.path + '/@' + key,
        safe(key, vb, secret), safe(key, va, secret));
    }
  }
  if (normalizeTrimmed(b.text) !== normalizeTrimmed(a.text)) {
    emit(section, property, field, cls, ctx, changes, n.path,
      safe(n.name, b.trimmedText(), secret), safe(n.name, a.trimmedText(), secret));
  }
  const tags = new Set<string>();
  for (const c of b.children) tags.add(c.name);
  for (const c of a.children) tags.add(c.name);
  for (const tag of tags) {
    const bl = meaningful(b.childrenNamed(tag));
    const al = meaningful(a.childrenNamed(tag));
    const bk = keyed(bl);
    const ak = keyed(al);
    if (bk !== null && ak !== null && (bl.length > 1 || al.length > 1)) {
      const keys = new Set<string>(bk.keys());
      for (const k of ak.keys()) keys.add(k);
      const bOrder = [...bk.keys()];
      const aOrder = [...ak.keys()];
      if (sameKeySet(bk, ak) && !sameList(bOrder, aOrder)) {
        emit(section, property + '/order', field, cls, ctx, changes, n.path,
          javaListToString(bOrder), javaListToString(aOrder));
      }
      for (const key of keys) {
        visit(bk.get(key) ?? null, ak.get(key) ?? null, section, property + '/' + tag, key, cls, ctx, changes, secret);
      }
    } else {
      const max = Math.max(bl.length, al.length);
      for (let i = 0; i < max; i++) {
        const nb = i < bl.length ? bl[i]! : null;
        const na = i < al.length ? al[i]! : null;
        const key = (na ?? nb)!.childText('name');
        visit(nb, na, section, property + '/' + tag + (max > 1 ? '[' + (i + 1) + ']' : ''),
          key ?? field, cls, ctx, changes, secret);
      }
    }
  }
}

function sameKeySet(x: ReadonlyMap<string, XmlNode>, y: ReadonlyMap<string, XmlNode>): boolean {
  if (x.size !== y.size) return false;
  for (const k of x.keys()) if (!y.has(k)) return false;
  return true;
}

function sameList(x: readonly string[], y: readonly string[]): boolean {
  return x.length === y.length && x.every((v, i) => v === y[i]);
}

/** AbstractCollection.toString: "[a, b]". */
function javaListToString(list: readonly string[]): string {
  return '[' + list.join(', ') + ']';
}

/** Entries keyed by name (or fieldname); null when a key is missing or duplicated. */
function keyed(nodes: readonly XmlNode[]): Map<string, XmlNode> | null {
  const map = new Map<string, XmlNode>();
  for (const node of nodes) {
    let key = node.childText('name');
    if (key === null) key = node.childText('fieldname');
    if (key === null) return null;
    const previous = map.get(key);
    map.set(key, node);
    if (previous !== undefined) return null;
  }
  return map;
}

function meaningful(nodes: readonly XmlNode[]): XmlNode[] {
  return nodes.filter((node) => !node.isSemanticallyEmpty());
}

function canonical(node: XmlNode | null): string {
  return node === null ? '' : canonicalOf(node, null);
}

function display(node: XmlNode | null, secret: boolean): string | null {
  if (node === null || node.isSemanticallyEmpty()) return null;
  return secret ? REDACTED : node.isLeaf() && node.attributes.size === 0
    ? redact(node.name, node.trimmedText()) : redactedCanonical(node);
}

function safe(key: string, value: string | null, secret: boolean): string | null {
  return value === null ? null : secret ? REDACTED : redact(key, value);
}

function emit(section: string, prop: string, field: string | null, cls: Classification, ctx: ComparisonContext,
  changes: Change[], path: string, before: string | null, after: string | null): void {
  changes.push(change(cls === 'unknown' ? 'unknown_change' : field !== null
    ? 'field_property_changed' : 'step_property_changed', cls, 'step')
    .stepName(ctx.stepName).stepType(ctx.stepType).section(section).field(field)
    .property(field === null ? prop : prop.substring(prop.lastIndexOf('/') + 1))
    .before(before).after(after).sourceXmlPath(path)
    .rawDiff(textDiff(before ?? '', after ?? '').unified).build());
}
