// it.ktrdiff.core.adapters.SelectValuesAdapter — SelectValues (Select / Rename values): compares
// the three tabs of the dialog — selected fields (<field>), removed fields (<remove>) and field
// metadata (<meta>) — grouping every difference by ETL field.
//
// On the Meta-data tab, type = None means "keep the incoming type": changing String -> None
// removes the forced conversion to String. The renderer surfaces this hint for SelectValues type
// changes involving None.

import { change, type Change, type Classification } from '../model/change.ts';
import type { StepModel } from '../model/document.ts';
import { sameStepType } from '../match/step-type-aliases.ts';
import { normalizeTrimmed } from '../normalize/normalizer.ts';
import { redact } from '../normalize/secret-redactor.ts';
import { stepXml, type ComparisonContext, type StepAdapter } from '../engine/step-adapter.ts';
import { XmlNode } from '../xml/xml-node.ts';

/** Meta-data tab properties with a direct effect on produced row metadata. */
const FUNCTIONAL_META_PROPS: ReadonlySet<string> = new Set([
  'type', 'length', 'precision', 'conversion_mask', 'encoding',
  'decimal_symbol', 'grouping_symbol', 'currency_symbol', 'storage_type',
  'date_format_locale', 'date_format_timezone',
]);

const CLAIMED: ReadonlySet<string> = new Set(['fields']);

type ClassifyFn = (prop: string) => Classification;

export class SelectValuesAdapter implements StepAdapter {
  readonly name = 'SelectValuesAdapter';

  supports(stepType: string | null): boolean {
    return sameStepType('SelectValues', stepType);
  }

  claimedTags(): ReadonlySet<string> {
    return CLAIMED;
  }

  compare(before: StepModel, after: StepModel, ctx: ComparisonContext): Change[] {
    const changes: Change[] = [];
    let fb = stepXml(before).child('fields');
    let fa = stepXml(after).child('fields');
    if (fb === null && fa === null) return changes;
    const empty = new XmlNode('fields', '', new Map(), [], 'fields');
    fb = fb ?? empty;
    fa = fa ?? empty;

    compareSelectTab(fb, fa, ctx, changes);
    compareRemoveTab(fb, fa, ctx, changes);
    compareMetaTab(fb, fa, ctx, changes);

    const orderBefore = [...byName(fb.childrenNamed('field')).keys()];
    const orderAfter = [...byName(fa.childrenNamed('field')).keys()];
    if (!sameList(orderBefore, orderAfter) && sameSet(orderBefore, orderAfter)) {
      changes.push(change('step_property_changed', 'functional', 'step')
        .stepType(ctx.stepType).stepName(ctx.stepName).section('fields').property('field_order')
        .before(orderBefore).after(orderAfter).sourceXmlPath(fa.path).build());
    }

    const sb = fb.childText('select_unspecified');
    const sa = fa.childText('select_unspecified');
    if (sb !== sa) {
      changes.push(change('step_property_changed', 'functional', 'step')
        .stepType(ctx.stepType).stepName(ctx.stepName)
        .section('fields').property('select_unspecified')
        .before(sb).after(sa)
        .sourceXmlPath(fa.path + '/select_unspecified')
        .build());
    }
    return changes;
  }
}

function compareSelectTab(fb: XmlNode, fa: XmlNode, ctx: ComparisonContext, changes: Change[]): void {
  const b = byName(fb.childrenNamed('field'));
  const a = byName(fa.childrenNamed('field'));
  for (const name of union(b.keys(), a.keys())) {
    const eb = b.get(name) ?? null;
    const ea = a.get(name) ?? null;
    if (eb === null || ea === null) {
      changes.push(change(eb === null ? 'field_added' : 'field_removed', 'functional', 'step')
        .stepType(ctx.stepType).stepName(ctx.stepName)
        .section('fields').field(name)
        .sourceXmlPath((eb ?? ea)!.path)
        .build());
      continue;
    }
    compareEntryProps(eb, ea, 'fields', name, ctx, changes,
      (prop) => prop === 'length' || prop === 'precision' ? 'functional' : 'potentially-functional');
  }
}

function compareRemoveTab(fb: XmlNode, fa: XmlNode, ctx: ComparisonContext, changes: Change[]): void {
  const b = names(fb.childrenNamed('remove'));
  const a = names(fa.childrenNamed('remove'));
  for (const name of union(b, a)) {
    const inB = b.has(name);
    const inA = a.has(name);
    if (inB === inA) continue;
    // A field entering the remove list disappears from the stream and vice versa.
    changes.push(change(inA ? 'field_removed' : 'field_added', 'functional', 'step')
      .stepType(ctx.stepType).stepName(ctx.stepName)
      .section('remove').field(name)
      .property('removed_from_stream')
      .before(inB).after(inA)
      .build());
  }
}

function compareMetaTab(fb: XmlNode, fa: XmlNode, ctx: ComparisonContext, changes: Change[]): void {
  const b = byName(fb.childrenNamed('meta'));
  const a = byName(fa.childrenNamed('meta'));
  for (const name of union(b.keys(), a.keys())) {
    const eb = b.get(name) ?? null;
    const ea = a.get(name) ?? null;
    if (eb === null || ea === null) {
      changes.push(change(eb === null ? 'field_added' : 'field_removed', 'functional', 'step')
        .stepType(ctx.stepType).stepName(ctx.stepName)
        .section('metadata').field(name)
        .sourceXmlPath((eb ?? ea)!.path)
        .build());
      continue;
    }
    compareEntryProps(eb, ea, 'metadata', name, ctx, changes,
      (prop) => FUNCTIONAL_META_PROPS.has(prop) ? 'functional' : 'potentially-functional');
  }
}

function compareEntryProps(eb: XmlNode, ea: XmlNode, section: string, fieldName: string,
  ctx: ComparisonContext, changes: Change[], classify: ClassifyFn): void {
  const props = new Set<string>();
  for (const c of eb.children) props.add(c.name);
  for (const c of ea.children) props.add(c.name);
  props.delete('name');
  for (const prop of props) {
    const vb = valueOf(eb, prop);
    const va = valueOf(ea, prop);
    if (vb === va) continue;
    if (prop === 'rename') {
      changes.push(change('field_renamed', 'functional', 'step')
        .stepType(ctx.stepType).stepName(ctx.stepName)
        .section(section).field(fieldName).property('rename')
        .beforeName(vb ?? fieldName)
        .afterName(va ?? fieldName)
        .before(vb).after(va)
        .sourceXmlPath(ea.path + '/rename')
        .build());
      continue;
    }
    changes.push(change('field_property_changed', classify(prop), 'step')
      .stepType(ctx.stepType).stepName(ctx.stepName)
      .section(section).field(fieldName).property(prop)
      .before(redact(prop, vb)).after(redact(prop, va))
      .sourceXmlPath(ea.path + '/' + prop)
      .build());
  }
}

function valueOf(entry: XmlNode, prop: string): string | null {
  const p = entry.child(prop);
  if (p === null) return null;
  const v = normalizeTrimmed(p.text);
  return v.length === 0 ? null : v;
}

function byName(entries: readonly XmlNode[]): Map<string, XmlNode> {
  const map = new Map<string, XmlNode>();
  for (const e of entries) {
    const name = e.childText('name');
    if (name !== null && !map.has(name)) map.set(name, e);
  }
  return map;
}

function names(entries: readonly XmlNode[]): Set<string> {
  const out = new Set<string>();
  for (const e of entries) {
    const name = e.childText('name');
    if (name !== null) out.add(name);
  }
  return out;
}

function union(a: Iterable<string>, b: Iterable<string>): Set<string> {
  const u = new Set<string>(a);
  for (const v of b) u.add(v);
  return u;
}

function sameList(x: readonly string[], y: readonly string[]): boolean {
  return x.length === y.length && x.every((v, i) => v === y[i]);
}

/** LinkedHashSet.equals: same elements regardless of order. */
function sameSet(x: readonly string[], y: readonly string[]): boolean {
  const sx = new Set(x);
  const sy = new Set(y);
  if (sx.size !== sy.size) return false;
  for (const v of sx) if (!sy.has(v)) return false;
  return true;
}
