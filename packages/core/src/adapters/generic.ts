// it.ktrdiff.core.adapters.GenericStepAdapter — fallback comparison for any step configuration.
// It never loses data:
// * the common step envelope (description, distribute, copies, partitioning, ...) maps to
//   step_property_changed with a documented classification;
// * canvas position maps to step_moved (layout);
// * collections whose entries carry a <name> child (e.g. <fields><field>) are matched by name
//   and produce field-level changes even for unsupported step types;
// * a leaf value change on a tag present on both sides is a step_property_changed classified
//   potentially-functional;
// * a tag appearing or disappearing with actual content is an unknown_change carrying the XML
//   path and both values — never silently dropped;
// * semantically empty elements are equivalent to absent ones (Spoon adds e.g. <row-meta/> on
//   re-save).

import { change, type Change, type ChangeKind, type ChangeValue, type Classification } from '../model/change.ts';
import type { StepModel } from '../model/document.ts';
import { canonical, normalizeTrimmed, redactedCanonical } from '../normalize/normalizer.ts';
import { redact } from '../normalize/secret-redactor.ts';
import { emptyToNull, stepXml, type ComparisonContext, type StepAdapter } from '../engine/step-adapter.ts';
import type { XmlNode } from '../xml/xml-node.ts';
import { textDiff } from './text-diff.ts';

/** Envelope tags handled explicitly (or by the engine) for every step type. */
const COMMON_LEAF_PROPS: ReadonlyMap<string, Classification> = new Map<string, Classification>([
  ['description', 'metadata'],
  ['distribute', 'potentially-functional'],
  ['custom_distribution', 'potentially-functional'],
  ['copies', 'functional'],
  ['cluster_schema', 'configuration'],
]);

/** Structural envelope tags compared as whole subtrees. */
const COMMON_SUBTREES: ReadonlyMap<string, Classification> = new Map<string, Classification>([
  ['partitioning', 'potentially-functional'],
  ['remotesteps', 'configuration'],
  ['attributes', 'configuration'],
  ['attributes_kjc', 'configuration'],
]);

/** Field-entry properties whose meaning is Pentaho-wide functional. */
const FUNCTIONAL_FIELD_PROPS: ReadonlySet<string> = new Set([
  'type', 'length', 'precision', 'format', 'conversion_mask',
]);

const NO_TAGS: ReadonlySet<string> = new Set();

export class GenericStepAdapter implements StepAdapter {
  readonly name = 'GenericStepAdapter';

  supports(): boolean {
    return true;
  }

  claimedTags(): ReadonlySet<string> {
    return NO_TAGS;
  }

  compare(before: StepModel, after: StepModel, ctx: ComparisonContext): Change[] {
    return this.compareUnclaimed(before, after, ctx, NO_TAGS);
  }

  /**
   * Compare everything except the tags claimed by a specific adapter. `name` is identity
   * (handled by the matcher) and `type` is checked by the engine, so both are always skipped.
   */
  compareUnclaimed(before: StepModel, after: StepModel, ctx: ComparisonContext,
    claimed: ReadonlySet<string>): Change[] {
    const changes: Change[] = [];
    const bx = stepXml(before);
    const ax = stepXml(after);
    this.comparePosition(before, after, ctx, changes);

    const tags = new Set<string>();
    for (const c of bx.children) tags.add(c.name);
    for (const c of ax.children) tags.add(c.name);
    tags.delete('name');
    tags.delete('type');
    tags.delete('GUI');
    for (const t of claimed) tags.delete(t);

    for (const tag of tags) {
      const b = bx.childrenNamed(tag);
      const a = ax.childrenNamed(tag);
      const leafCls = COMMON_LEAF_PROPS.get(tag);
      const subtreeCls = COMMON_SUBTREES.get(tag);
      if (leafCls !== undefined) {
        this.compareLeafLists(tag, b, a, ctx, changes, 'step_property_changed', leafCls, 'properties');
      } else if (subtreeCls !== undefined) {
        this.compareSubtreeCanonical(tag, b, a, ctx, changes, subtreeCls);
      } else {
        this.compareGenericTag(tag, b, a, ctx, changes);
      }
    }
    return changes;
  }

  private comparePosition(before: StepModel, after: StepModel, ctx: ComparisonContext, changes: Change[]): void {
    const bg = stepXml(before).child('GUI');
    const ag = stepXml(after).child('GUI');
    this.compareLeafLists('draw', bg === null ? [] : bg.childrenNamed('draw'),
      ag === null ? [] : ag.childrenNamed('draw'), ctx, changes,
      'step_property_changed', 'layout', 'position');
    const moved = before.xloc !== after.xloc || before.yloc !== after.yloc;
    if (moved) {
      changes.push(change('step_moved', 'layout', 'step')
        .stepType(ctx.stepType)
        .stepName(ctx.stepName)
        .section('position')
        .property('position')
        .before(before.positionString())
        .after(after.positionString())
        .sourceXmlPath(ag !== null ? ag.path : bg !== null ? bg.path : stepXml(after).path + '/GUI')
        .build());
    }
  }

  private compareLeafLists(tag: string, b: readonly XmlNode[], a: readonly XmlNode[], ctx: ComparisonContext,
    changes: Change[], kind: ChangeKind, cls: Classification, section: string): void {
    const bv = b.length === 0 ? null : emptyToNull(normalizeTrimmed(b[0]!.text));
    const av = a.length === 0 ? null : emptyToNull(normalizeTrimmed(a[0]!.text));
    if (bv === av) return;
    changes.push(change(kind, cls, 'step')
      .stepType(ctx.stepType)
      .stepName(ctx.stepName)
      .section(section)
      .property(tag)
      .before(redact(tag, bv))
      .after(redact(tag, av))
      .sourceXmlPath(pathOf(b, a, tag))
      .build());
  }

  private compareSubtreeCanonical(tag: string, b: readonly XmlNode[], a: readonly XmlNode[],
    ctx: ComparisonContext, changes: Change[], cls: Classification): void {
    const cb = b.length === 0 ? '' : canonical(b[0]!, null);
    const ca = a.length === 0 ? '' : canonical(a[0]!, null);
    if (cb === ca) return;
    changes.push(change('step_property_changed', cls, 'step')
      .stepType(ctx.stepType)
      .stepName(ctx.stepName)
      .section('properties')
      .property(tag)
      .before(b.length === 0 ? null : emptyToNull(redactedCanonical(b[0]!)))
      .after(a.length === 0 ? null : emptyToNull(redactedCanonical(a[0]!)))
      .sourceXmlPath(pathOf(b, a, tag))
      .build());
  }

  /** Unclaimed, non-envelope tag: keyed collection, recursive structure or unknown change. */
  private compareGenericTag(tag: string, b: readonly XmlNode[], a: readonly XmlNode[],
    ctx: ComparisonContext, changes: Change[]): void {
    const nb = b.length === 0 ? null : b[0]!;
    const na = a.length === 0 ? null : a[0]!;
    const bEmpty = nb === null || nb.isSemanticallyEmpty();
    const aEmpty = na === null || na.isSemanticallyEmpty();
    if (bEmpty && aEmpty) return; // empty ≡ absent
    if (bEmpty !== aEmpty) {
      const present = (bEmpty ? na : nb)!;
      let value: ChangeValue = present.isLeaf()
        ? normalizeTrimmed(present.text)
        : redactedCanonical(present);
      value = redact(tag, value);
      changes.push(change('unknown_change', 'unknown', 'xml')
        .stepType(ctx.stepType)
        .stepName(ctx.stepName)
        .section('unknown')
        .property(tag)
        .before(bEmpty ? null : value)
        .after(aEmpty ? null : value)
        .sourceXmlPath(present.path)
        .build());
      return;
    }
    // both present and non-empty from here on
    const bn = nb!;
    const an = na!;
    if (bn.isLeaf() && an.isLeaf()) {
      const vb = normalizeTrimmed(bn.text);
      const va = normalizeTrimmed(an.text);
      if (vb !== va) {
        changes.push(change('step_property_changed', 'potentially-functional', 'step')
          .stepType(ctx.stepType)
          .stepName(ctx.stepName)
          .section('configuration')
          .property(tag)
          .before(redact(tag, vb))
          .after(redact(tag, va))
          .sourceXmlPath(an.path)
          .build());
      }
      return;
    }
    // Structured content on at least one side.
    if (isKeyedCollection(bn, an)) {
      this.compareKeyedCollection(tag, bn, an, ctx, changes);
      return;
    }
    const cb = canonical(bn, null);
    const ca = canonical(an, null);
    if (cb !== ca) {
      const db = redactedCanonical(bn);
      const da = redactedCanonical(an);
      changes.push(change('unknown_change', 'unknown', 'xml')
        .stepType(ctx.stepType)
        .stepName(ctx.stepName)
        .section('unknown')
        .property(tag)
        .before(emptyToNull(db))
        .after(emptyToNull(da))
        .sourceXmlPath(an.path)
        .rawDiff(textDiff(db, da).unified)
        .build());
    }
  }

  private compareKeyedCollection(tag: string, b: XmlNode, a: XmlNode, ctx: ComparisonContext,
    changes: Change[]): void {
    // scalar settings inside the container
    const leafTags = new Set<string>();
    for (const c of b.children) if (c.isLeaf()) leafTags.add(c.name);
    for (const c of a.children) if (c.isLeaf()) leafTags.add(c.name);
    for (const lt of leafTags) {
      this.compareLeafLists(lt, b.childrenNamed(lt), a.childrenNamed(lt), ctx, changes,
        'step_property_changed', 'potentially-functional', tag);
    }

    // keyed entries, grouped by (entryTag, name)
    const bEntries = keyedEntries(b);
    const aEntries = keyedEntries(a);
    const keys = new Set<string>(bEntries.keys());
    for (const k of aEntries.keys()) keys.add(k);
    for (const key of keys) {
      const eb = bEntries.get(key) ?? null;
      const ea = aEntries.get(key) ?? null;
      const fieldName = key.substring(key.indexOf('|') + 1);
      if (eb === null || ea === null) {
        changes.push(change(eb === null ? 'field_added' : 'field_removed', 'potentially-functional', 'step')
          .stepType(ctx.stepType)
          .stepName(ctx.stepName)
          .section(tag)
          .field(fieldName)
          .sourceXmlPath((eb ?? ea)!.path)
          .build());
        continue;
      }
      compareKeyedEntry(tag, fieldName, eb, ea, ctx, changes);
    }
  }
}

/** A container whose repeated children each carry a <name> child (fields pattern). */
function isKeyedCollection(b: XmlNode, a: XmlNode): boolean {
  return hasKeyedChildren(b) && hasKeyedChildren(a);
}

function hasKeyedChildren(container: XmlNode): boolean {
  if (container.children.length === 0) {
    return true; // vacuously compatible with the other side's keyed shape
  }
  let sawEntry = false;
  for (const c of container.children) {
    if (c.isLeaf()) continue; // scalar settings living next to the entries (e.g. select_unspecified)
    if (c.child('name') === null) return false;
    sawEntry = true;
  }
  return sawEntry || container.children.every((c) => c.isLeaf());
}

function keyedEntries(container: XmlNode): Map<string, XmlNode> {
  const map = new Map<string, XmlNode>();
  for (const c of container.children) {
    if (!c.isLeaf() && c.child('name') !== null) {
      const key = c.name + '|' + String(c.childText('name'));
      if (!map.has(key)) map.set(key, c);
    }
  }
  return map;
}

function compareKeyedEntry(section: string, fieldName: string, eb: XmlNode, ea: XmlNode,
  ctx: ComparisonContext, changes: Change[]): void {
  const props = new Set<string>();
  for (const c of eb.children) props.add(c.name);
  for (const c of ea.children) props.add(c.name);
  props.delete('name');
  for (const prop of props) {
    const pb = eb.child(prop);
    const pa = ea.child(prop);
    const vb = pb === null ? null : emptyToNull(normalizeTrimmed(pb.text));
    const va = pa === null ? null : emptyToNull(normalizeTrimmed(pa.text));
    if (vb === va) continue;
    const cls: Classification = FUNCTIONAL_FIELD_PROPS.has(prop) ? 'functional' : 'potentially-functional';
    changes.push(change('field_property_changed', cls, 'step')
      .stepType(ctx.stepType)
      .stepName(ctx.stepName)
      .section(section)
      .field(fieldName)
      .property(prop)
      .before(redact(prop, vb))
      .after(redact(prop, va))
      .sourceXmlPath((pa ?? pb)!.path)
      .build());
  }
}

function pathOf(b: readonly XmlNode[], a: readonly XmlNode[], tag: string): string {
  if (a.length > 0) return a[0]!.path;
  if (b.length > 0) return b[0]!.path;
  return tag;
}
