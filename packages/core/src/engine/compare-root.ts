// DiffEngine.compareRootExtras, compareErrorHandling, hopXml: root-level sections outside the
// steps/hops/notes/connections model, unknown root tags (never hidden), and hop extensions
// (job hop evaluation flags, unknown hop XML) keyed by logical endpoint identities.

import { change, type Change } from '../model/change.ts';
import type { TransformationModel } from '../model/document.ts';
import { canonical } from '../normalize/normalizer.ts';
import type { XmlNode } from '../xml/xml-node.ts';
import { logicalIdsByName } from './compare-hops.ts';
import { emptyToNull } from './step-adapter.ts';
import { displayCanonical } from './values.ts';
import { XmlFallback } from './xml-fallback.ts';

const KNOWN_ROOT_TAGS: ReadonlySet<string> = new Set([
  'info', 'notepads', 'connection', 'order', 'step',
  'step_error_handling', 'slave-step-copy-partition-distribution',
  'slave_transformation', 'attributes']);
const STRUCTURED_ROOT_TAGS = ['slave_transformation', 'slave-step-copy-partition-distribution', 'attributes'] as const;
const ROOT_HANDLED: ReadonlySet<string> = new Set(['info', 'step', 'connection', 'notepads', 'order']);
const HOP_ONLY: ReadonlySet<string> = new Set(['hop']);
const HOP_HANDLED: ReadonlySet<string> = new Set(['from', 'to', 'enabled']);
const JOB_HOP_FLAGS = ['evaluation', 'unconditional'] as const;

export function compareRootExtras(before: TransformationModel, after: TransformationModel, changes: Change[]): void {
  const firstChange = changes.length;
  compareErrorHandling(before, after, changes);

  for (const tag of STRUCTURED_ROOT_TAGS) {
    const nb = before.root.child(tag);
    const na = after.root.child(tag);
    const cb = nb === null ? '' : canonical(nb, null);
    const ca = na === null ? '' : canonical(na, null);
    if (cb !== ca) {
      changes.push(change('transformation_property_changed', 'configuration', 'transformation')
        .section('info').property(tag)
        .before(emptyToNull(displayCanonical(nb))).after(emptyToNull(displayCanonical(na)))
        .sourceXmlPath((na ?? nb)!.path)
        .build());
    }
  }

  const tags = new Set<string>();
  for (const c of before.root.children) tags.add(c.name);
  for (const c of after.root.children) tags.add(c.name);
  for (const known of KNOWN_ROOT_TAGS) tags.delete(known);
  for (const tag of tags) {
    const nb = before.root.child(tag);
    const na = after.root.child(tag);
    const bEmpty = nb === null || nb.isSemanticallyEmpty();
    const aEmpty = na === null || na.isSemanticallyEmpty();
    if (bEmpty && aEmpty) continue;
    const cb = nb === null ? null : emptyToNull(canonical(nb, null));
    const ca = na === null ? null : emptyToNull(canonical(na, null));
    if (cb === ca) continue;
    changes.push(change('unknown_change', 'unknown', 'xml')
      .section('unknown').property(tag)
      .before(emptyToNull(displayCanonical(nb))).after(emptyToNull(displayCanonical(na)))
      .sourceXmlPath((na ?? nb)!.path)
      .build());
  }
  new XmlFallback(changes.slice(firstChange), changes, null, null).compare(before.root, after.root, ROOT_HANDLED);
  const bo = before.root.child('order');
  const ao = after.root.child('order');
  if (bo !== null && ao !== null) {
    new XmlFallback([], changes, null, null).compare(bo, ao, HOP_ONLY);
    // Hop identity already survives step renames; inspect only extensions here.
    const bh = hopXml(bo, logicalIdsByName(before));
    const ah = hopXml(ao, logicalIdsByName(after));
    for (const [key, hb] of bh) {
      const ha = ah.get(key);
      if (ha === undefined) continue;
      const firstHopChange = changes.length;
      if (after.documentType() === 'job') {
        for (const prop of JOB_HOP_FLAGS) {
          const bv = hb.childText(prop);
          const av = ha.childText(prop);
          if (bv !== av) {
            changes.push(change('hop_changed', 'functional', 'hop')
              .section('hops').property(prop).fromStep(ha.childText('from')).toStep(ha.childText('to'))
              .before(bv).after(av).sourceXmlPath(ha.path + '/' + prop).build());
          }
        }
      }
      new XmlFallback(changes.slice(firstHopChange), changes, null, null).compare(hb, ha, HOP_HANDLED);
    }
  }
}

/** Endpoint identity of a hop element; a missing endpoint concatenates as "null" like Java. */
function endpoint(name: string | null, identities: ReadonlyMap<string, string>): string {
  return name === null ? 'null' : identities.get(name) ?? name;
}

/** LinkedHashMap.put: a later duplicate replaces the value and keeps the first position. */
function hopXml(order: XmlNode, identities: ReadonlyMap<string, string>): Map<string, XmlNode> {
  const result = new Map<string, XmlNode>();
  for (const hop of order.childrenNamed('hop')) {
    result.set(endpoint(hop.childText('from'), identities) + '->' + endpoint(hop.childText('to'), identities), hop);
  }
  return result;
}

function compareErrorHandling(before: TransformationModel, after: TransformationModel, changes: Change[]): void {
  const b = errorEntries(before.root.child('step_error_handling'));
  const a = errorEntries(after.root.child('step_error_handling'));
  const sources = new Set<string>(b.keys());
  for (const k of a.keys()) sources.add(k);
  for (const source of sources) {
    const eb = b.get(source) ?? null;
    const ea = a.get(source) ?? null;
    const cb = eb === null ? '' : canonical(eb, null);
    const ca = ea === null ? '' : canonical(ea, null);
    if (cb === ca) continue;
    changes.push(change('step_property_changed', 'functional', 'step')
      .stepName(source)
      .section('error_handling').property('error_handling')
      .before(emptyToNull(displayCanonical(eb))).after(emptyToNull(displayCanonical(ea)))
      .sourceXmlPath((ea ?? eb)!.path)
      .build());
  }
}

function errorEntries(errorHandling: XmlNode | null): Map<string, XmlNode> {
  const map = new Map<string, XmlNode>();
  if (errorHandling === null) return map;
  for (const e of errorHandling.childrenNamed('error')) {
    const source = e.childText('source_step');
    if (source !== null && !map.has(source)) map.set(source, e);
  }
  return map;
}
