// it.ktrdiff.core.render.TextRenderer — human-readable console report. The renderer may group
// elementary hop add/remove pairs into a "target changed" presentation; the underlying ChangeSet
// keeps the elementary events. Java StringBuilder.append(null) prints "null": `str` keeps that.

import { AdapterRegistry } from '../engine/adapter-registry.ts';
import { javaValueOf } from '../engine/values.ts';
import { sameStepType } from '../match/step-type-aliases.ts';
import type { Change, ChangeValue } from '../model/change.ts';
import { changeSetResult, classificationSummary, type ChangeSet } from '../model/change-set.ts';
import type { DiffConfig } from '../profile/diff-config.ts';
import { applyMode, hiddenCounts, type FilteredChangeSet } from '../profile/mode-filter.ts';
import { javaDoubleToString } from '../util/java.ts';

const registry = new AdapterRegistry();

const str = (v: ChangeValue): string => javaValueOf(v);

export function renderText(changeSet: ChangeSet, config: DiffConfig): string {
  const filtered = applyMode(changeSet, config);
  const out: string[] = [];

  const name = changeSet.metadata.get('afterTransformation')
    ?? changeSet.metadata.get('beforeTransformation') ?? '';
  out.push('Transformation: ', name === '' ? '(unnamed)' : name, '\n');
  out.push('Result: ', changeSetResult(changeSet), '  |  Mode: ', config.mode, '\n', '\n');

  if (changeSet.errors.length > 0) {
    out.push('ERRORS\n');
    for (const e of changeSet.errors) {
      out.push('  [', e.code, ']');
      if (e.side !== null) out.push(' (', e.side, ')');
      out.push(' ', str(e.message), '\n');
    }
    return out.join('');
  }

  const counts = classificationSummary(changeSet);
  out.push('Summary\n');
  out.push('  Functional: ', String(counts.get('functional')), '\n');
  out.push('  Layout: ', String(counts.get('layout')), '\n');
  out.push('  Metadata: ', String(counts.get('metadata')), '\n');
  out.push('  Configuration: ', String(counts.get('configuration')), '\n');
  out.push('  Potentially functional: ', String(counts.get('potentially-functional')), '\n');
  out.push('  Unknown: ', String(counts.get('unknown')), '\n');
  if (filtered.hidden.length > 0) {
    out.push('  Hidden by ', config.mode, ' mode: ', String(filtered.hidden.length), '\n');
  }
  out.push('\n');

  if (changeSet.warnings.length > 0) {
    out.push('WARNINGS\n');
    for (const w of changeSet.warnings) out.push('  [', str(w.code), '] ', str(w.message), '\n');
    out.push('\n');
  }

  const visible = filtered.visible;
  renderStepLifecycle(out, visible);
  renderHops(out, visible);
  renderModifiedSteps(out, visible);
  renderNotes(out, visible);
  renderConnections(out, visible);
  renderTransformation(out, visible);
  renderUnknown(out, visible);
  renderHiddenSummary(out, filtered);
  return out.join('');
}

function renderStepLifecycle(out: string[], visible: readonly Change[]): void {
  for (const c of visible) {
    if (c.kind === 'step_added') {
      out.push('STEP ADDED\n  ', str(c.stepName), ' [', str(c.stepType), ']\n\n');
    } else if (c.kind === 'step_removed') {
      out.push('STEP REMOVED\n  ', str(c.stepName), ' [', str(c.stepType), ']\n\n');
    } else if (c.kind === 'step_renamed') {
      out.push('STEP RENAMED\n  - ', str(c.beforeName), '\n  + ', str(c.afterName), '  [', str(c.stepType), ']');
      if (c.confidence !== null && c.confidence < 1.0) {
        out.push('  (confidence ', javaDoubleToString(c.confidence), ')');
      }
      out.push('\n\n');
    }
  }
}

/** Groups hop_removed + hop_added sharing an endpoint into a "target/source changed" block. */
function renderHops(out: string[], visible: readonly Change[]): void {
  const removed = visible.filter((c) => c.kind === 'hop_removed');
  const added = visible.filter((c) => c.kind === 'hop_added');
  const changed = visible.filter((c) => c.kind === 'hop_changed');
  // Change does not override equals, so Java's List.contains is an identity check too.
  const consumed = new Set<Change>();
  for (const r of removed) {
    let pairTarget: Change | null = null;
    let pairSource: Change | null = null;
    for (const a of added) {
      if (consumed.has(a)) continue;
      if (a.fromStep === r.fromStep && a.toStep !== r.toStep) {
        pairTarget = a;
        break;
      }
      if (a.toStep === r.toStep && a.fromStep !== r.fromStep) pairSource = a;
    }
    if (pairTarget !== null) {
      consumed.add(pairTarget);
      out.push('HOP TARGET CHANGED\n  ', str(r.fromStep), '\n', '  - ', str(r.toStep), '\n',
        '  + ', str(pairTarget.toStep), '\n\n');
    } else if (pairSource !== null) {
      consumed.add(pairSource);
      out.push('HOP SOURCE CHANGED\n  -> ', str(r.toStep), '\n', '  - ', str(r.fromStep), '\n',
        '  + ', str(pairSource.fromStep), '\n\n');
    } else {
      out.push('HOP REMOVED\n  ', str(r.fromStep), ' -> ', str(r.toStep), '\n\n');
    }
  }
  for (const a of added) {
    if (!consumed.has(a)) out.push('HOP ADDED\n  ', str(a.fromStep), ' -> ', str(a.toStep), '\n\n');
  }
  for (const c of changed) {
    out.push('HOP CHANGED\n  ', str(c.fromStep), ' -> ', str(c.toStep),
      '\n  enabled: ', str(c.before), ' -> ', str(c.after), '\n\n');
  }
}

function renderModifiedSteps(out: string[], visible: readonly Change[]): void {
  const bySteps = new Map<string, Change[]>();
  for (const c of visible) {
    const stepDetail = c.stepName !== null
      && c.kind !== 'step_added'
      && c.kind !== 'step_removed'
      && c.kind !== 'step_renamed'
      && c.entity !== 'hop'
      && c.entity !== 'note'
      && c.entity !== 'connection'
      && c.entity !== 'transformation'
      && c.kind !== 'unknown_change';
    if (stepDetail) {
      const key = c.stepName + '|' + (c.stepType === null ? '' : c.stepType);
      let list = bySteps.get(key);
      if (list === undefined) bySteps.set(key, (list = []));
      list.push(c);
    }
  }
  for (const [key, changes] of bySteps) {
    const sep = key.lastIndexOf('|');
    const stepName = key.substring(0, sep);
    const stepType = key.substring(sep + 1);
    out.push('MODIFIED STEP\n  ', stepName);
    if (stepType !== '') out.push(' [', stepType, ']');
    out.push('\n');
    if (stepType !== '' && registry.specificFor(stepType) === null) {
      out.push('  Semantic adapter: unavailable — compared via generic fallback\n');
    }
    let lastField: string | null = null;
    for (const c of changes) {
      if (c.field !== null && c.field !== lastField) {
        out.push('\n  ', c.field, '\n');
        lastField = c.field;
      }
      renderStepDetail(out, c);
    }
    out.push('\n');
  }
}

function renderStepDetail(out: string[], c: Change): void {
  const indent = c.field !== null ? '    ' : '  ';
  switch (c.kind) {
    case 'field_added':
      out.push(indent, '+ field added', c.section !== null ? ' (' + c.section + ')' : '', '\n');
      break;
    case 'field_removed':
      out.push(indent, '- field removed', c.section !== null ? ' (' + c.section + ')' : '', '\n');
      break;
    case 'field_renamed':
      out.push(indent, 'renamed to: ', str(c.afterName), '\n');
      break;
    case 'sql_changed':
    case 'script_changed':
      out.push(indent, c.kind === 'sql_changed' ? 'SQL' : 'Script', ' changed');
      if (c.property === 'formatting' || c.property === 'whitespace') out.push(' (formatting only)');
      out.push(':\n');
      for (const line of c.removedFragments) out.push(indent, '- ', line, '\n');
      for (const line of c.addedFragments) out.push(indent, '+ ', line, '\n');
      break;
    default: {
      const label = c.property === null ? c.kind : humanProperty(c.property);
      out.push(indent, label, ':\n');
      out.push(indent, '- ', valueOrEmpty(c.before), '\n');
      out.push(indent, '+ ', valueOrEmpty(c.after), '\n');
      appendSemanticHint(out, c, indent);
      break;
    }
  }
}

/**
 * SelectValues Meta-data hint, based on the observed fixture structure: type None means the
 * incoming type is kept and no conversion is forced.
 */
function appendSemanticHint(out: string[], c: Change, indent: string): void {
  if (c.kind === 'field_property_changed'
    && c.property === 'type'
    && c.section === 'metadata'
    && sameStepType('SelectValues', c.stepType)
    && str(c.after) === 'None') {
    out.push(indent, '  (None = keep the incoming type; the forced conversion to ', str(c.before),
      ' is removed)\n');
  }
}

function renderNotes(out: string[], visible: readonly Change[]): void {
  for (const c of visible) {
    switch (c.kind) {
      case 'note_added':
        out.push('NOTE ADDED\n  "', str(c.after), '"\n\n');
        break;
      case 'note_removed':
        out.push('NOTE REMOVED\n  "', str(c.before), '"\n\n');
        break;
      case 'note_changed':
        out.push('NOTE CHANGED (', str(c.property), ')\n  - ', valueOrEmpty(c.before), '\n  + ',
          valueOrEmpty(c.after), '\n\n');
        break;
      case 'note_moved':
        out.push('NOTE MOVED\n  "', str(c.field), '": ', str(c.before), ' -> ', str(c.after), '\n\n');
        break;
      default:
        break;
    }
  }
}

function renderConnections(out: string[], visible: readonly Change[]): void {
  let header = false;
  for (const c of visible) {
    if (c.kind !== 'connection_changed') continue;
    if (!header) {
      out.push('CONNECTIONS\n');
      header = true;
    }
    const name = c.afterName !== null ? c.afterName : c.beforeName;
    out.push('  ', str(name), ' — ', humanProperty(c.property), ':\n');
    out.push('    - ', valueOrEmpty(c.before), '\n');
    out.push('    + ', valueOrEmpty(c.after), '\n');
  }
  if (header) out.push('\n');
}

function renderTransformation(out: string[], visible: readonly Change[]): void {
  let header = false;
  for (const c of visible) {
    if (c.kind !== 'transformation_property_changed') continue;
    if (!header) {
      out.push('TRANSFORMATION PROPERTIES\n');
      header = true;
    }
    out.push('  ', c.field !== null ? c.field + '.' : '', str(c.property), ': ',
      valueOrEmpty(c.before), ' -> ', valueOrEmpty(c.after), '\n');
  }
  if (header) out.push('\n');
}

function renderUnknown(out: string[], visible: readonly Change[]): void {
  let header = false;
  for (const c of visible) {
    if (c.kind !== 'unknown_change') continue;
    if (!header) {
      out.push('UNKNOWN CHANGES\n');
      header = true;
    }
    out.push('  ');
    if (c.stepName !== null) out.push(c.stepName, ' — ');
    out.push('<', str(c.property), '>: ', valueOrEmpty(c.before), ' -> ', valueOrEmpty(c.after), '\n');
    if (c.sourceXmlPath !== null) out.push('    at ', c.sourceXmlPath, '\n');
  }
  if (header) out.push('\n');
}

function renderHiddenSummary(out: string[], filtered: FilteredChangeSet): void {
  if (filtered.hidden.length === 0) return;
  out.push('HIDDEN BY ', filtered.mode.toUpperCase(), ' MODE\n');
  for (const [cls, n] of hiddenCounts(filtered)) {
    out.push('  ', String(n), ' ', cls, n === 1 ? ' change' : ' changes', '\n');
  }
  out.push('  (run with --mode advanced to show everything)\n');
}

function humanProperty(property: string | null): string {
  if (property === null || property === '') return '';
  const p = property.replaceAll('_', ' ');
  // Character.toUpperCase maps one UTF-16 unit to one unit; JS may expand (e.g. "ß" -> "SS").
  const first = p.charAt(0);
  const upper = first.toUpperCase();
  return (upper.length === 1 ? upper : first) + p.substring(1);
}

function valueOrEmpty(v: ChangeValue): string {
  return v === null ? '(none)' : str(v);
}
