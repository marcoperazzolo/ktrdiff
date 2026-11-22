// Per-file change summary (step G2): synthetic change lists for every counting rule, then real
// the directory result/JSON carrying the summary (D2). Fixture cases: summary-fixtures.test.ts.
import { describe, expect, it } from 'vitest';
import {
  advancedConfig, compareDirectories, defaultConfig, renderDirectoryJson, summarizeChanges,
} from '../src/index.ts';
import type { Change, ChangeKind, EntityKind } from '../src/index.ts';
import { ChangeBuilder } from '../src/model/change.ts';
import * as K from './support/ktrs.ts';

function c(kind: ChangeKind, entity: EntityKind, set: (b: ChangeBuilder) => ChangeBuilder = (b) => b): Change {
  return set(new ChangeBuilder(kind, 'functional', entity)).build();
}

const zero = { added: 0, removed: 0, renamed: 0, modified: 0 };

describe('summarizeChanges: rules', () => {
  it('counts one step per identity with precedence added > removed > renamed > modified', () => {
    const s = summarizeChanges([
      c('step_renamed', 'step', (b) => b.logicalId('S1').stepName('New')),
      c('step_property_changed', 'step', (b) => b.logicalId('S1').stepName('New')),
      c('step_moved', 'step', (b) => b.logicalId('S1').stepName('New')),
      c('step_property_changed', 'step', (b) => b.logicalId('S2').stepName('Kept')),
      c('step_property_changed', 'step', (b) => b.logicalId('S2').stepName('Kept')),
      c('step_added', 'step', (b) => b.logicalId('S3').stepName('Fresh')),
      c('step_removed', 'step', (b) => b.logicalId('S4').stepName('Gone')),
    ]);
    expect(s.steps).toEqual({ added: 1, removed: 1, renamed: 1, modified: 1 });
    expect(s.total).toBe(7);
  });

  it('rolls field, SQL, script, filter and step-scoped unknown changes up to their step', () => {
    const s = summarizeChanges([
      c('field_added', 'step', (b) => b.logicalId('S1').stepName('Select')),
      c('sql_changed', 'step', (b) => b.logicalId('S1').stepName('Select')),
      c('script_changed', 'step', (b) => b.logicalId('S2').stepName('Script')),
      c('filter_changed', 'step', (b) => b.logicalId('S2').stepName('Script')),
      c('unknown_change', 'xml', (b) => b.logicalId('S2').stepName('Script')),
      c('unknown_change', 'xml', (b) => b.stepName('Orphan')),
    ]);
    expect(s.steps).toEqual({ ...zero, modified: 3 });
    expect(s.other).toBe(0);
  });

  it('counts unattributable unknown changes as other and document properties as document', () => {
    const s = summarizeChanges([
      c('unknown_change', 'xml', (b) => b.sourceXmlPath('/transformation/extra')),
      c('unknown_change', 'xml', (b) => b.sourceXmlPath('/transformation/info/custom')),
      c('transformation_property_changed', 'transformation', (b) => b.property('description')),
    ]);
    expect(s).toEqual({ steps: zero, hops: zero, notes: zero, connections: zero, document: 1, other: 2, total: 3 });
  });

  it('identifies hops by endpoints and side, notes by side and path, connections by name', () => {
    const s = summarizeChanges([
      c('hop_removed', 'hop', (b) => b.fromStep('A').toStep('B')),
      c('hop_added', 'hop', (b) => b.fromStep('A').toStep('B')),
      c('hop_changed', 'hop', (b) => b.fromStep('B').toStep('C').property('enabled')),
      c('hop_changed', 'hop', (b) => b.fromStep('B').toStep('C').property('evaluation')),
      c('note_removed', 'note', (b) => b.sourceXmlPath('/transformation/notepads/notepad[1]')),
      c('note_added', 'note', (b) => b.sourceXmlPath('/transformation/notepads/notepad[1]')),
      c('note_moved', 'note', (b) => b.sourceXmlPath('/transformation/notepads/notepad[2]')),
      c('note_changed', 'note', (b) => b.sourceXmlPath('/transformation/notepads/notepad[2]')),
      c('connection_renamed', 'connection', (b) => b.beforeName('Old').afterName('New')),
      c('connection_changed', 'connection', (b) => b.beforeName('New').afterName('New')),
      c('connection_removed', 'connection', (b) => b.beforeName('Gone')),
    ]);
    expect(s.hops).toEqual({ added: 1, removed: 1, renamed: 0, modified: 1 });
    expect(s.notes).toEqual({ added: 1, removed: 1, renamed: 0, modified: 1 });
    expect(s.connections).toEqual({ added: 0, removed: 1, renamed: 1, modified: 0 });
  });

  it('returns all zeros for an empty list', () => {
    expect(summarizeChanges([])).toEqual(
      { steps: zero, hops: zero, notes: zero, connections: zero, document: 0, other: 0, total: 0 });
  });
});

describe('directory summary (D2)', () => {
  const ktr = (path: string, x: number) => ({ name: path, content: K.transformation('T', K.dummyStep('A', x, 0)) });

  it('summarizes the changes visible in the requested mode', () => {
    const before = [ktr('moved.ktr', 0)];
    const after = [ktr('moved.ktr', 500)];
    const advanced = compareDirectories(before, after, advancedConfig());
    const quick = compareDirectories(before, after, defaultConfig());
    expect(advanced.files[0]!.summary.steps.modified).toBe(1);
    expect(quick.files[0]!.summary.total).toBe(0);
    const json = JSON.parse(renderDirectoryJson(advanced, advancedConfig()));
    expect(Object.keys(json.files[0])).toEqual(['beforePath', 'afterPath', 'status', 'method', 'summary', 'comparison']);
    expect(json.files[0].summary.steps).toEqual({ ...zero, modified: 1 });
  });
});
