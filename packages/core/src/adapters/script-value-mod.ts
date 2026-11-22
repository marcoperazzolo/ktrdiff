// it.ktrdiff.core.adapters.ScriptValueModAdapter — "Modified Java Script Value": compares script
// bodies per named script (line diff — the code is never executed), plus the declared output
// fields with their type/length/precision and the compatibility/optimization settings.

import { change, type Change, type Classification } from '../model/change.ts';
import type { StepModel } from '../model/document.ts';
import { sameStepType } from '../match/step-type-aliases.ts';
import { normalizeText, sameIgnoringWhitespace } from '../normalize/normalizer.ts';
import { emptyToNull, stepXml, type ComparisonContext, type StepAdapter } from '../engine/step-adapter.ts';
import type { XmlNode } from '../xml/xml-node.ts';
import { textDiff } from './text-diff.ts';

const CLAIMED: ReadonlySet<string> = new Set(['jsScripts', 'fields', 'compatible', 'optimizationLevel']);

const FIELD_PROPS = ['rename', 'type', 'length', 'precision', 'replace'] as const;

export class ScriptValueModAdapter implements StepAdapter {
  readonly name = 'ScriptValueModAdapter';

  supports(stepType: string | null): boolean {
    return sameStepType('ScriptValueMod', stepType);
  }

  claimedTags(): ReadonlySet<string> {
    return CLAIMED;
  }

  compare(before: StepModel, after: StepModel, ctx: ComparisonContext): Change[] {
    const changes: Change[] = [];
    compareScripts(before, after, ctx, changes);
    compareOutputFields(before, after, ctx, changes);
    compareLeaf(before, after, 'compatible', 'potentially-functional', ctx, changes);
    compareLeaf(before, after, 'optimizationLevel', 'configuration', ctx, changes);
    return changes;
  }
}

function compareScripts(before: StepModel, after: StepModel, ctx: ComparisonContext, changes: Change[]): void {
  const b = scriptsByName(stepXml(before));
  const a = scriptsByName(stepXml(after));
  const names = new Set<string>(b.keys());
  for (const n of a.keys()) names.add(n);
  for (const name of names) {
    const sb = b.get(name) ?? null;
    const sa = a.get(name) ?? null;
    if (sb === null || sa === null) {
      const present = (sb ?? sa)!;
      const body = present.childRawText('jsScript_script');
      const diff = sb === null ? textDiff('', body) : textDiff(body, '');
      changes.push(change('script_changed', 'functional', 'step')
        .stepType(ctx.stepType).stepName(ctx.stepName)
        .section('script').property(sb === null ? 'script_added' : 'script_removed')
        .field(name)
        .before(sb === null ? null : name)
        .after(sa === null ? null : name)
        .addedFragments(diff.addedLines)
        .removedFragments(diff.removedLines)
        .rawDiff(diff.unified)
        .sourceXmlPath(present.path)
        .build());
      continue;
    }
    const bodyB = normalizeText(sb.childRawText('jsScript_script'));
    const bodyA = normalizeText(sa.childRawText('jsScript_script'));
    const tb = bodyB ?? '';
    const ta = bodyA ?? '';
    if (tb !== ta) {
      const whitespaceOnly = sameIgnoringWhitespace(tb, ta);
      const cls: Classification = whitespaceOnly && ctx.config.scriptsIgnoreWhitespace ? 'metadata' : 'functional';
      const diff = textDiff(tb, ta);
      changes.push(change('script_changed', cls, 'step')
        .stepType(ctx.stepType).stepName(ctx.stepName)
        .section('script')
        .property(whitespaceOnly ? 'whitespace' : 'source')
        .field(name)
        // The whole texts let the web app show the script with its changed words (D8).
        .before(tb).after(ta)
        .addedFragments(diff.addedLines)
        .removedFragments(diff.removedLines)
        .rawDiff(diff.unified)
        .sourceXmlPath(sa.path + '/jsScript_script')
        .build());
    }
    const typeB = sb.childText('jsScript_type');
    const typeA = sa.childText('jsScript_type');
    if (typeB !== typeA) {
      changes.push(change('script_changed', 'potentially-functional', 'step')
        .stepType(ctx.stepType).stepName(ctx.stepName)
        .section('script').property('script_type').field(name)
        .before(typeB).after(typeA)
        .sourceXmlPath(sa.path + '/jsScript_type')
        .build());
    }
  }
}

function scriptsByName(step: XmlNode): Map<string, XmlNode> {
  const map = new Map<string, XmlNode>();
  const scripts = step.child('jsScripts');
  if (scripts === null) return map;
  let i = 0;
  for (const s of scripts.childrenNamed('jsScript')) {
    i++;
    const name = s.childText('jsScript_name');
    const key = name === null || name.length === 0 ? 'script ' + i : name;
    if (!map.has(key)) map.set(key, s);
  }
  return map;
}

function compareOutputFields(before: StepModel, after: StepModel, ctx: ComparisonContext, changes: Change[]): void {
  const b = fieldsByName(stepXml(before));
  const a = fieldsByName(stepXml(after));
  const names = new Set<string>(b.keys());
  for (const n of a.keys()) names.add(n);
  for (const name of names) {
    const fb = b.get(name) ?? null;
    const fa = a.get(name) ?? null;
    if (fb === null || fa === null) {
      changes.push(change(fb === null ? 'field_added' : 'field_removed', 'functional', 'step')
        .stepType(ctx.stepType).stepName(ctx.stepName)
        .section('fields').field(name)
        .sourceXmlPath((fb ?? fa)!.path)
        .build());
      continue;
    }
    for (const prop of FIELD_PROPS) {
      const vb = emptyToNull(fb.childText(prop));
      const va = emptyToNull(fa.childText(prop));
      if (vb === va) continue;
      if (prop === 'rename') {
        changes.push(change('field_renamed', 'functional', 'step')
          .stepType(ctx.stepType).stepName(ctx.stepName)
          .section('fields').field(name).property('rename')
          .beforeName(vb).afterName(va)
          .before(vb).after(va)
          .sourceXmlPath(fa.path + '/rename')
          .build());
      } else {
        changes.push(change('field_property_changed', 'functional', 'step')
          .stepType(ctx.stepType).stepName(ctx.stepName)
          .section('fields').field(name).property(prop)
          .before(vb).after(va)
          .sourceXmlPath(fa.path + '/' + prop)
          .build());
      }
    }
  }
}

function fieldsByName(step: XmlNode): Map<string, XmlNode> {
  const map = new Map<string, XmlNode>();
  const fields = step.child('fields');
  if (fields === null) return map;
  for (const f of fields.childrenNamed('field')) {
    const name = f.childText('name');
    if (name !== null && !map.has(name)) map.set(name, f);
  }
  return map;
}

function compareLeaf(before: StepModel, after: StepModel, tag: string, cls: Classification,
  ctx: ComparisonContext, changes: Change[]): void {
  const vb = emptyToNull(stepXml(before).childText(tag));
  const va = emptyToNull(stepXml(after).childText(tag));
  if (vb !== va) {
    changes.push(change('step_property_changed', cls, 'step')
      .stepType(ctx.stepType).stepName(ctx.stepName)
      .section('properties').property(tag)
      .before(vb).after(va)
      .sourceXmlPath(stepXml(after).path + '/' + tag)
      .build());
  }
}
