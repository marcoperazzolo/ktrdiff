// it.ktrdiff.core.engine.XmlFallback — safety net for XML not represented by semantic changes.
// Runs before mode filtering. Collections pair by a unique name/code, otherwise by position:
// duplicates are never discarded. Coverage is local to one entity and uses source paths, not
// fixture values or plugin names.

import { textDiff } from '../adapters/text-diff.ts';
import { change, type Change } from '../model/change.ts';
import { canonical as canonicalOf, normalizeTrimmed, redactedCanonical } from '../normalize/normalizer.ts';
import { isSecretProperty, redact, REDACTED } from '../normalize/secret-redactor.ts';
import { XmlNode } from '../xml/xml-node.ts';
import { javaValueOf } from './values.ts';

const NO_TAGS: ReadonlySet<string> = new Set();
const UNIQUE_KEYS = ['name', 'jsScript_name', 'code'] as const;

export class XmlFallback {
  /** Snapshot of the entity's semantic changes (Java copies the subList at construction). */
  private readonly covered: readonly Change[];
  private readonly output: Change[];
  private readonly stepName: string | null;
  private readonly stepType: string | null;

  constructor(covered: readonly Change[], output: Change[], stepName: string | null, stepType: string | null) {
    this.covered = [...covered];
    this.output = output;
    this.stepName = stepName;
    this.stepType = stepType;
  }

  compare(before: XmlNode | null, after: XmlNode | null, ignoredChildren: ReadonlySet<string>): void {
    this.compareNodes(before, after, ignoredChildren, false);
  }

  private compareNodes(b: XmlNode | null, a: XmlNode | null, ignoredChildren: ReadonlySet<string>,
    secretAncestor: boolean): void {
    if (canonical(b) === canonical(a)) return;
    // Both absent canonicalize to "" and returned above.
    const node = (a ?? b)!;
    const path = node.path;
    const secret = secretAncestor || isSecretProperty(node.name)
      || isSecretProperty(node.childText('code'))
      || isSecretProperty(node.childText('name'));
    if (b === null || a === null) {
      const np = normalizePath(path);
      if (ignoredChildren.size > 0 || this.covered.some((c) => c.sourceXmlPath !== null
        && (normalizePath(c.sourceXmlPath).startsWith(np + '/')
          || (c.kind === 'step_moved' && normalizePath(c.sourceXmlPath) === np)))) {
        const empty = new XmlNode(node.name, '', new Map(), [], path);
        this.compareNodes(b ?? empty, a ?? empty, ignoredChildren, secretAncestor);
        return;
      }
      if (!this.isCovered(path)) {
        this.emit(node.name, path, display(b, secret), display(a, secret));
      }
      return;
    }
    const attrs = new Set<string>(b.attributes.keys());
    for (const k of a.attributes.keys()) attrs.add(k);
    for (const attr of attrs) {
      const bv = b.attributes.get(attr) ?? null;
      const av = a.attributes.get(attr) ?? null;
      if (bv !== av) {
        const ap = path + '/@' + attr;
        if (!this.isCovered(ap)) this.emit('@' + attr, ap, safe(attr, bv, secret), safe(attr, av, secret));
      }
    }
    const bt = normalizeTrimmed(b.text);
    const at = normalizeTrimmed(a.text);
    if (bt !== at && !this.isCovered(path)) {
      this.emit(node.name, path, safe(node.name, bt, secret), safe(node.name, at, secret));
    }
    const bc = children(b, ignoredChildren);
    const ac = children(a, ignoredChildren);
    const tags = new Set<string>(bc.keys());
    for (const k of ac.keys()) tags.add(k);
    for (const tag of tags) {
      const bl = bc.get(tag) ?? [];
      const al = ac.get(tag) ?? [];
      const key = uniqueKey(bl, al);
      if (key !== null) {
        const bm = keyed(bl, key);
        const am = keyed(al, key);
        const names = new Set<string>(bm.keys());
        for (const k of am.keys()) names.add(k);
        for (const name of names) this.compareNodes(bm.get(name) ?? null, am.get(name) ?? null, NO_TAGS, secret);
      } else {
        for (let i = 0; i < Math.max(bl.length, al.length); i++) {
          this.compareNodes(bl[i] ?? null, al[i] ?? null, NO_TAGS, secret);
        }
      }
    }
  }

  private isCovered(path: string): boolean {
    const normalized = normalizePath(path);
    for (const c of this.covered) {
      if (c.sourceXmlPath === null) continue;
      const cp = normalizePath(c.sourceXmlPath);
      if (c.kind === 'step_moved') {
        if (normalized === cp + '/xloc' || normalized === cp + '/yloc') return true;
        continue;
      }
      if (normalized === cp) return true;
      // A scalar semantic change does not cover unknown attributes/descendants.
      const whole = c.kind === 'field_added' || c.kind === 'field_removed'
        || javaValueOf(c.before).startsWith('<')
        || javaValueOf(c.after).startsWith('<')
        || c.property === 'script_added' || c.property === 'script_removed';
      if (whole && normalized.startsWith(cp + '/')) return true;
    }
    return false;
  }

  private emit(property: string, path: string, before: string | null, after: string | null): void {
    this.output.push(change('unknown_change', 'unknown', 'xml')
      .stepName(this.stepName).stepType(this.stepType).section('unknown').property(property)
      .before(before).after(after).sourceXmlPath(path)
      .rawDiff(textDiff(before ?? '', after ?? '').unified).build());
  }
}

function children(node: XmlNode, ignored: ReadonlySet<string>): Map<string, XmlNode[]> {
  const result = new Map<string, XmlNode[]>();
  for (const child of node.children) {
    if (!ignored.has(child.name) && !child.isSemanticallyEmpty()) {
      let list = result.get(child.name);
      if (list === undefined) {
        list = [];
        result.set(child.name, list);
      }
      list.push(child);
    }
  }
  return result;
}

function uniqueKey(b: readonly XmlNode[], a: readonly XmlNode[]): string | null {
  for (const key of UNIQUE_KEYS) {
    if (unique(b, key) && unique(a, key) && (b.length > 0 || a.length > 0)) return key;
  }
  return null;
}

function unique(nodes: readonly XmlNode[], key: string): boolean {
  const seen = new Set<string>();
  for (const node of nodes) {
    const value = node.childText(key);
    if (value === null || seen.has(value)) return false;
    seen.add(value);
  }
  return true;
}

function keyed(nodes: readonly XmlNode[], key: string): Map<string, XmlNode> {
  const result = new Map<string, XmlNode>();
  // uniqueKey guarantees a non-null, distinct key per node.
  for (const node of nodes) result.set(node.childText(key)!, node);
  return result;
}

function normalizePath(path: string): string {
  return path.replaceAll('[1]', '');
}

function canonical(node: XmlNode | null): string {
  return node === null ? '' : canonicalOf(node, null);
}

function safe(key: string, value: string | null, secret: boolean): string | null {
  return value === null ? null : secret ? REDACTED : redact(key, value);
}

function display(node: XmlNode | null, secret: boolean): string | null {
  if (node === null || node.isSemanticallyEmpty()) return null;
  if (secret) return REDACTED;
  return node.isLeaf() && node.attributes.size === 0
    ? redact(node.name, normalizeTrimmed(node.text))
    : redactedCanonical(node);
}
