// DiffEngine.compareConnections: connections pair by name; a removed and an added connection with
// identical canonical content (name excluded) are a rename unless ambiguous. A connection used by
// a step makes its changes functional. Secret values are always redacted.

import type { Classification } from '../model/change.ts';
import { change, type Change } from '../model/change.ts';
import type { ConnectionModel, TransformationModel } from '../model/document.ts';
import { fingerprint, normalizeTrimmed } from '../normalize/normalizer.ts';
import { redact } from '../normalize/secret-redactor.ts';
import type { XmlNode } from '../xml/xml-node.ts';
import { emptyToNull, stepXml } from './step-adapter.ts';
import { XmlFallback } from './xml-fallback.ts';

const NAME_ONLY: ReadonlySet<string> = new Set(['name']);

function connXml(c: ConnectionModel): XmlNode {
  if (c.xml === null) throw new Error('connection without XML: ' + c.name);
  return c.xml;
}

export function compareConnections(before: TransformationModel, after: TransformationModel, changes: Change[]): void {
  if (before.documentType() === 'connection' && before.connections.length === 1 && after.connections.length === 1) {
    const b = before.connections[0]!;
    const a = after.connections[0]!;
    if (b.name !== a.name) {
      changes.push(change('connection_renamed', 'configuration', 'connection')
        .beforeName(b.name).afterName(a.name).section('connections').property('name').before(b.name).after(a.name)
        .sourceXmlPath(connXml(a).path + '/name').build());
    }
    compareConnectionPair(a.name, b, a, 'configuration', changes);
    return;
  }
  const b = byName(before.connections);
  const a = byName(after.connections);
  const removedNames = [...b.keys()].filter((n) => !a.has(n));
  const addedNames = [...a.keys()].filter((n) => !b.has(n));

  // Rename detection: a removed and an added connection with identical canonical content (name
  // excluded) are the same connection under a new name.
  const renamedRemoved = new Set<string>();
  const renamedAdded = new Set<string>();
  for (const removed of removedNames) {
    const removedFp = connectionFingerprint(b.get(removed)!);
    let match: string | null = null;
    for (const added of addedNames) {
      if (renamedAdded.has(added)) continue;
      if (removedFp === connectionFingerprint(a.get(added)!)) {
        if (match !== null) {
          match = null; // two identical candidates -> ambiguous, keep add/remove
          break;
        }
        match = added;
      }
    }
    if (match !== null) {
      renamedRemoved.add(removed);
      renamedAdded.add(match);
      const used = connectionUsed(before, removed) || connectionUsed(after, match);
      changes.push(change('connection_renamed', used ? 'functional' : 'configuration', 'connection')
        .beforeName(removed).afterName(match)
        .section('connections').property('name')
        .before(removed).after(match)
        .sourceXmlPath(connXml(a.get(match)!).path)
        .build());
    }
  }

  for (const name of removedNames) {
    if (renamedRemoved.has(name)) continue;
    const used = connectionUsed(before, name);
    changes.push(change('connection_removed', used ? 'functional' : 'configuration', 'connection')
      .beforeName(name)
      .section('connections').property('presence')
      .before(true).after(false)
      .sourceXmlPath(connXml(b.get(name)!).path)
      .build());
  }
  for (const name of addedNames) {
    if (renamedAdded.has(name)) continue;
    const used = connectionUsed(after, name);
    changes.push(change('connection_added', used ? 'functional' : 'configuration', 'connection')
      .afterName(name)
      .section('connections').property('presence')
      .before(false).after(true)
      .sourceXmlPath(connXml(a.get(name)!).path)
      .build());
  }
  for (const [name, cb] of b) {
    const ca = a.get(name);
    if (ca !== undefined) {
      const used = connectionUsed(before, name) || connectionUsed(after, name);
      compareConnectionPair(name, cb, ca, used ? 'functional' : 'configuration', changes);
    }
  }
}

/** LinkedHashMap.putIfAbsent: the first connection with a given name wins. */
function byName(connections: readonly ConnectionModel[]): Map<string, ConnectionModel> {
  const map = new Map<string, ConnectionModel>();
  for (const c of connections) {
    if (!map.has(c.name)) map.set(c.name, c);
  }
  return map;
}

function connectionFingerprint(c: ConnectionModel): string {
  return fingerprint(connXml(c), NAME_ONLY);
}

function connectionUsed(trans: TransformationModel, name: string): boolean {
  for (const s of trans.steps) {
    if (referencesConnection(stepXml(s), name)) return true;
  }
  return false;
}

function referencesConnection(node: XmlNode, name: string): boolean {
  for (const c of node.children) {
    if (c.isLeaf() && c.name === 'connection' && name === c.trimmedText()) return true;
    if (!c.isLeaf() && referencesConnection(c, name)) return true;
  }
  return false;
}

function compareConnectionPair(name: string, cb: ConnectionModel, ca: ConnectionModel, cls: Classification,
  changes: Change[]): void {
  const firstChange = changes.length;
  const bx = connXml(cb);
  const ax = connXml(ca);
  const tags = new Set<string>();
  for (const c of bx.children) tags.add(c.name);
  for (const c of ax.children) tags.add(c.name);
  tags.delete('name');
  for (const tag of tags) {
    const nb = bx.child(tag);
    const na = ax.child(tag);
    if (tag === 'attributes') {
      compareConnectionAttributes(name, nb, na, changes);
      continue;
    }
    const vb = nb === null ? null : emptyToNull(normalizeTrimmed(nb.text));
    const va = na === null ? null : emptyToNull(normalizeTrimmed(na.text));
    if (vb === va) continue;
    changes.push(change('connection_changed', cls, 'connection')
      .beforeName(name).afterName(name)
      .section('connection').property(tag)
      .before(redact(tag, vb))
      .after(redact(tag, va))
      .sourceXmlPath((na ?? nb)!.path)
      .build());
  }
  new XmlFallback(changes.slice(firstChange), changes, null, null).compare(bx, ax, NAME_ONLY);
}

function compareConnectionAttributes(name: string, b: XmlNode | null, a: XmlNode | null, changes: Change[]): void {
  const mb = attributeMap(b);
  const ma = attributeMap(a);
  const codes = new Set<string>(mb.keys());
  for (const k of ma.keys()) codes.add(k);
  for (const code of codes) {
    const vb = mb.get(code) ?? null;
    const va = ma.get(code) ?? null;
    if (vb === va) continue;
    changes.push(change('connection_changed', 'configuration', 'connection')
      .beforeName(name).afterName(name)
      .section('attributes').property(code)
      .before(redact(code, vb))
      .after(redact(code, va))
      // A code exists only when at least one side has an <attributes> element.
      .sourceXmlPath(connectionAttributePath((a ?? b)!, code))
      .build());
  }
}

function connectionAttributePath(attributes: XmlNode, code: string): string {
  for (const attr of attributes.childrenNamed('attribute')) {
    if (code === attr.childText('code')) return attr.path + '/attribute';
  }
  return attributes.path;
}

function attributeMap(attributes: XmlNode | null): Map<string, string | null> {
  const map = new Map<string, string | null>();
  if (attributes === null) return map;
  for (const attr of attributes.childrenNamed('attribute')) {
    const code = attr.childText('code');
    const value = attr.childText('attribute');
    if (code !== null) map.set(code, value);
  }
  return map;
}
