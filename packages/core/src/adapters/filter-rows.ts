// it.ktrdiff.core.adapters.FilterRowsAdapter — reads the logical structure of the
// <compare><condition> tree (field, function, comparison value, AND/OR operator, negation,
// nesting) plus the true/false target steps. The condition is never evaluated.

import { change, type Change, type ChangeValue } from '../model/change.ts';
import type { StepModel } from '../model/document.ts';
import { sameStepType } from '../match/step-type-aliases.ts';
import { emptyToNull, stepXml, type ComparisonContext, type StepAdapter } from '../engine/step-adapter.ts';
import type { XmlNode } from '../xml/xml-node.ts';

const CLAIMED: ReadonlySet<string> = new Set(['compare', 'send_true_to', 'send_false_to']);

export class FilterRowsAdapter implements StepAdapter {
  readonly name = 'FilterRowsAdapter';

  supports(stepType: string | null): boolean {
    return sameStepType('FilterRows', stepType);
  }

  claimedTags(): ReadonlySet<string> {
    return CLAIMED;
  }

  compare(before: StepModel, after: StepModel, ctx: ComparisonContext): Change[] {
    const changes: Change[] = [];
    compareTarget('send_true_to', before, after, ctx, changes);
    compareTarget('send_false_to', before, after, ctx, changes);

    const cb = rootCondition(stepXml(before));
    const ca = rootCondition(stepXml(after));
    if (cb === null && ca === null) return changes;
    if (cb === null || ca === null) {
      changes.push(filterChange(ctx, null, 'condition',
        cb === null ? null : describeCondition(cb),
        ca === null ? null : describeCondition(ca),
        (ca ?? cb)!.path));
      return changes;
    }
    compareCondition(cb, ca, ctx, changes);
    return changes;
  }
}

function compareTarget(tag: string, before: StepModel, after: StepModel, ctx: ComparisonContext,
  changes: Change[]): void {
  const b = stepXml(before).childText(tag);
  const a = stepXml(after).childText(tag);
  if (emptyToNull(b) !== emptyToNull(a)) {
    changes.push(change('step_property_changed', 'functional', 'step')
      .stepType(ctx.stepType).stepName(ctx.stepName)
      .section('targets').property(tag)
      .before(emptyToNull(b)).after(emptyToNull(a))
      .sourceXmlPath(stepXml(after).path + '/' + tag)
      .build());
  }
}

function rootCondition(step: XmlNode): XmlNode | null {
  const compare = step.child('compare');
  return compare === null ? null : compare.child('condition');
}

/** Recursive structural comparison; nested conditions pair by position. */
function compareCondition(b: XmlNode, a: XmlNode, ctx: ComparisonContext, changes: Change[]): void {
  compareScalar(b, a, 'negated', 'negated', ctx, changes);
  compareScalar(b, a, 'operator', 'operator', ctx, changes);
  compareScalar(b, a, 'leftvalue', 'field', ctx, changes);
  compareScalar(b, a, 'function', 'function', ctx, changes);
  compareScalar(b, a, 'rightvalue', 'rightvalue', ctx, changes);

  const vb = b.child('value');
  const va = a.child('value');
  if (vb !== null || va !== null) {
    const field = coalesce(a.childText('leftvalue'), b.childText('leftvalue'));
    compareValue(vb, va, field, ctx, changes);
  }

  const nb = childConditions(b);
  const na = childConditions(a);
  const common = Math.min(nb.length, na.length);
  for (let i = 0; i < common; i++) compareCondition(nb[i]!, na[i]!, ctx, changes);
  for (let i = common; i < nb.length; i++) {
    changes.push(filterChange(ctx, leftValueOf(nb[i]!), 'condition', describeCondition(nb[i]!), null, nb[i]!.path));
  }
  for (let i = common; i < na.length; i++) {
    changes.push(filterChange(ctx, leftValueOf(na[i]!), 'condition', null, describeCondition(na[i]!), na[i]!.path));
  }
}

function compareScalar(b: XmlNode, a: XmlNode, tag: string, property: string, ctx: ComparisonContext,
  changes: Change[]): void {
  const vb = emptyToNull(b.childText(tag));
  const va = emptyToNull(a.childText(tag));
  if (vb !== va) {
    const field = coalesce(a.childText('leftvalue'), b.childText('leftvalue'));
    changes.push(filterChange(ctx, field, property, vb, va, a.path + '/' + tag));
  }
}

function compareValue(vb: XmlNode | null, va: XmlNode | null, field: string | null, ctx: ComparisonContext,
  changes: Change[]): void {
  compareValueProp(vb, va, 'text', 'value', field, ctx, changes);
  compareValueProp(vb, va, 'type', 'value_type', field, ctx, changes);
  compareValueProp(vb, va, 'mask', 'mask', field, ctx, changes);
  compareValueProp(vb, va, 'isnull', 'isnull', field, ctx, changes);
  compareValueProp(vb, va, 'length', 'value_length', field, ctx, changes);
  compareValueProp(vb, va, 'precision', 'value_precision', field, ctx, changes);
}

function compareValueProp(vb: XmlNode | null, va: XmlNode | null, tag: string, property: string,
  field: string | null, ctx: ComparisonContext, changes: Change[]): void {
  const b = vb === null ? null : emptyToNull(vb.childText(tag));
  const a = va === null ? null : emptyToNull(va.childText(tag));
  if (b !== a) {
    const path = va !== null ? va.path + '/' + tag : (vb !== null ? vb.path + '/' + tag : tag);
    changes.push(filterChange(ctx, field, property, b, a, path));
  }
}

function filterChange(ctx: ComparisonContext, field: string | null, property: string,
  before: ChangeValue, after: ChangeValue, path: string): Change {
  return change('filter_changed', 'functional', 'step')
    .stepType(ctx.stepType).stepName(ctx.stepName)
    .section('condition').field(emptyToNull(field)).property(property)
    .before(before).after(after)
    .sourceXmlPath(path)
    .build();
}

function childConditions(condition: XmlNode): XmlNode[] {
  const conditions = condition.child('conditions');
  return conditions === null ? [] : conditions.childrenNamed('condition');
}

function leftValueOf(condition: XmlNode): string | null {
  const lv = condition.childText('leftvalue');
  if (lv !== null && lv.length > 0) return lv;
  const nested = childConditions(condition);
  return nested.length === 0 ? null : leftValueOf(nested[0]!);
}

/** Human-readable rendering of a condition subtree, e.g. `AGE >= 18`. */
export function describeCondition(condition: XmlNode): string {
  const nested = childConditions(condition);
  if (nested.length > 0) {
    let sb = '(';
    for (let i = 0; i < nested.length; i++) {
      const n = nested[i]!;
      if (i > 0) {
        const op = n.childText('operator');
        sb += ' ' + (op ?? 'AND') + ' ';
      }
      sb += describeCondition(n);
    }
    return sb + ')';
  }
  const negated = condition.childText('negated');
  const left = condition.childText('leftvalue');
  const fn = condition.childText('function');
  const right = condition.childText('rightvalue');
  let valueText: string | null = null;
  const value = condition.child('value');
  if (value !== null) valueText = value.childText('text');
  let sb = '';
  // "Y".equalsIgnoreCase(negated): only y/Y fold to Y
  if (negated === 'Y' || negated === 'y') sb += 'NOT ';
  sb += (left ?? '?') + ' ' + (fn ?? '=') + ' ';
  sb += valueText ?? (right !== null && right.length > 0 ? '[' + right + ']' : '?');
  return sb;
}

function coalesce(a: string | null, b: string | null): string | null {
  return a !== null && a.length > 0 ? a : b;
}
