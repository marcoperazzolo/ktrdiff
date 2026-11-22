// DiffEngine.compareInfo, compareInfoSubtree, compareParameters: document-level properties with a
// documented classification, volatile Spoon save artifacts, structured subtrees, parameters, and
// unknown info tags (never hidden).

import { textDiff } from '../adapters/text-diff.ts';
import type { Classification } from '../model/change.ts';
import { change, type Change } from '../model/change.ts';
import type { TransformationModel } from '../model/document.ts';
import { canonical, normalizeTrimmed } from '../normalize/normalizer.ts';
import { redact } from '../normalize/secret-redactor.ts';
import { isVolatileInfoProperty } from '../normalize/volatile.ts';
import type { XmlNode } from '../xml/xml-node.ts';
import { emptyToNull } from './step-adapter.ts';
import { displayCanonical } from './values.ts';
import { XmlFallback } from './xml-fallback.ts';

/** Leaf info properties with a documented classification. */
const INFO_LEAF_CLASSIFICATION: ReadonlyMap<string, Classification> = new Map<string, Classification>([
  ['description', 'metadata'],
  ['extended_description', 'metadata'],
  ['trans_status', 'potentially-functional'],
  ['job_status', 'potentially-functional'],
  ['pass_batchid', 'configuration'],
  ['trans_type', 'potentially-functional'],
  ['size_rowset', 'configuration'],
  ['sleep_time_empty', 'configuration'],
  ['sleep_time_full', 'configuration'],
  ['unique_connections', 'configuration'],
  ['feedback_shown', 'configuration'],
  ['feedback_size', 'configuration'],
  ['using_thread_priorities', 'configuration'],
  ['shared_objects_file', 'configuration'],
  ['capture_step_performance', 'configuration'],
  ['step_performance_capturing_delay', 'configuration'],
  ['step_performance_capturing_size_limit', 'configuration'],
]);

const INFO_SUBTREES: ReadonlySet<string> = new Set([
  'parameters', 'log', 'maxdate', 'dependencies', 'partitionschemas',
  'slaveservers', 'clusterschemas', 'job-log-table', 'jobentry-log-table', 'channel-log-table']);

const NO_TAGS: ReadonlySet<string> = new Set();

function infoOf(trans: TransformationModel): XmlNode {
  // Both parsers always build an <info> node (KtrParser rejects documents without one).
  if (trans.info === null) throw new Error('document without info');
  return trans.info;
}

export function compareInfo(before: TransformationModel, after: TransformationModel, changes: Change[]): void {
  if (before.documentType() === 'connection') return; // KDB name is compared once, as connection identity.
  const firstChange = changes.length;
  const ib = infoOf(before);
  const ia = infoOf(after);
  const tags = new Set<string>();
  for (const c of ib.children) tags.add(c.name);
  for (const c of ia.children) tags.add(c.name);
  for (const tag of tags) {
    const nb = ib.child(tag);
    const na = ia.child(tag);
    if (INFO_SUBTREES.has(tag)) {
      compareInfoSubtree(tag, nb, na, changes);
      continue;
    }
    const vb = nb === null ? null : emptyToNull(normalizeTrimmed(nb.text));
    const va = na === null ? null : emptyToNull(normalizeTrimmed(na.text));
    if (vb === va) continue;
    const cls = INFO_LEAF_CLASSIFICATION.get(tag);
    if (isVolatileInfoProperty(tag)) {
      changes.push(change('transformation_property_changed', 'metadata', 'transformation')
        .section('storage').property(tag)
        .before(vb).after(va)
        .volatileChange(true)
        .sourceXmlPath(pathOfInfo(nb, na, tag))
        .build());
    } else if (cls !== undefined) {
      changes.push(change('transformation_property_changed', cls, 'transformation')
        .section('info').property(tag)
        .before(vb).after(va)
        .sourceXmlPath(pathOfInfo(nb, na, tag))
        .build());
    } else {
      changes.push(change('unknown_change', 'unknown', 'xml')
        .section('unknown').property(tag)
        .before(redact(tag, vb)).after(redact(tag, va))
        .sourceXmlPath(pathOfInfo(nb, na, tag))
        .build());
    }
  }
  new XmlFallback(changes.slice(firstChange), changes, null, null).compare(ib, ia, NO_TAGS);
}

function compareInfoSubtree(tag: string, nb: XmlNode | null, na: XmlNode | null, changes: Change[]): void {
  if (tag === 'parameters') {
    compareParameters(nb, na, changes);
    return;
  }
  const cb = nb === null ? '' : canonical(nb, null);
  const ca = na === null ? '' : canonical(na, null);
  if (cb === ca) return;
  const cls: Classification = tag === 'maxdate' ? 'potentially-functional' : 'configuration';
  const db = displayCanonical(nb);
  const da = displayCanonical(na);
  changes.push(change('transformation_property_changed', cls, 'transformation')
    .section('info').property(tag)
    .before(emptyToNull(db)).after(emptyToNull(da))
    .sourceXmlPath(pathOfInfo(nb, na, tag))
    .rawDiff(textDiff(db, da).unified)
    .build());
}

function compareParameters(nb: XmlNode | null, na: XmlNode | null, changes: Change[]): void {
  const b = parameterMap(nb);
  const a = parameterMap(na);
  const names = new Set<string>(b.keys());
  for (const k of a.keys()) names.add(k);
  for (const name of names) {
    const pb = b.get(name) ?? null;
    const pa = a.get(name) ?? null;
    if (pb === null || pa === null) {
      changes.push(change('transformation_property_changed', 'functional', 'transformation')
        .section('parameters').property(name)
        .before(pb === null ? null : 'defined')
        .after(pa === null ? null : 'defined')
        .sourceXmlPath((pb ?? pa)!.path)
        .build());
      continue;
    }
    for (const prop of ['default_value', 'description']) {
      const vb = emptyToNull(pb.childText(prop));
      const va = emptyToNull(pa.childText(prop));
      if (vb !== va) {
        changes.push(change('transformation_property_changed',
          prop === 'description' ? 'metadata' : 'functional', 'transformation')
          .section('parameters').field(name).property(prop)
          .before(redact(name, vb)).after(redact(name, va))
          .sourceXmlPath(pa.path + '/' + prop)
          .build());
      }
    }
  }
}

function pathOfInfo(nb: XmlNode | null, na: XmlNode | null, tag: string): string {
  if (na !== null) return na.path;
  if (nb !== null) return nb.path;
  return '/transformation/info/' + tag;
}

function parameterMap(parameters: XmlNode | null): Map<string, XmlNode> {
  const map = new Map<string, XmlNode>();
  if (parameters === null) return map;
  for (const p of parameters.childrenNamed('parameter')) {
    const name = p.childText('name');
    if (name !== null && !map.has(name)) map.set(name, p);
  }
  return map;
}
