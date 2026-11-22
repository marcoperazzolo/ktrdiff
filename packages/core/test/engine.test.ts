// Port of DiffEngineTest (it.ktrdiff.core.engine). Each title starts with the Java method name.
import { describe, expect, it } from 'vitest';
import {
  advancedConfig, applyMode, changeSetResult, compareDocuments, defaultConfig, renderJson, withInclude,
} from '../src/index.ts';
import type { Change, ChangeKind } from '../src/model/change.ts';
import type { ChangeSet } from '../src/model/change-set.ts';
import { encodeUtf8 } from '../src/util/utf8.ts';
import * as K from './support/ktrs.ts';

function compare(beforeBody: string, afterBody: string): ChangeSet {
  return compareDocuments(
    { name: 'before.ktr', content: K.transformation('demo', beforeBody) },
    { name: 'after.ktr', content: K.transformation('demo', afterBody) },
    advancedConfig());
}

function kinds(cs: ChangeSet): ChangeKind[] {
  return cs.changes.filter((c) => !c.volatile).map((c) => c.kind);
}

function byKind(cs: ChangeSet, kind: ChangeKind): Change {
  const c = cs.changes.find((x) => x.kind === kind);
  if (c === undefined) throw new Error('no change of kind ' + kind);
  return c;
}

const sorted = (xs: readonly string[]): string[] => [...xs].sort();

describe('DiffEngine: steps, hops, graph', () => {
  it('comparingAFileWithItselfProducesZeroChanges', () => {
    const body = K.order(K.hop('A', 'B')) + K.dummyStep('A', 0, 0) + K.dummyStep('B', 10, 0);
    const cs = compare(body, body);
    expect(cs.changes).toHaveLength(0);
    expect(changeSetResult(cs)).toBe('unchanged');
  });

  it('swappingBeforeAndAfterInvertsAddedAndRemoved', () => {
    const withStep = K.dummyStep('A', 0, 0) + K.dummyStep('Extra', 10, 0);
    const withoutStep = K.dummyStep('A', 0, 0);
    const forward = compare(withoutStep, withStep);
    const backward = compare(withStep, withoutStep);
    expect(kinds(forward)).toEqual(['step_added']);
    expect(kinds(backward)).toEqual(['step_removed']);
    expect(forward.changes[0]!.stepName).toBe('Extra');
    expect(backward.changes[0]!.stepName).toBe('Extra');
  });

  it('stepAddedAndRemovedAreDetected', () => {
    const base = K.order(K.hop('A', 'B')) + K.dummyStep('A', 0, 0) + K.dummyStep('B', 10, 0);
    const withMore = K.order(K.hop('A', 'B')) + K.dummyStep('A', 0, 0) + K.dummyStep('B', 10, 0)
      + K.rowGenStep('New Generator', 'X', 'String', '5', 20, 0);
    const cs = compare(base, withMore);
    expect(cs.changes).toHaveLength(1);
    const c = cs.changes[0]!;
    expect(c.kind).toBe('step_added');
    expect(c.classification).toBe('functional');
    expect(c.stepName).toBe('New Generator');
    expect(c.afterName).toBe('New Generator');
  });

  it('removedStepAlsoRemovesItsHop', () => {
    const before = K.order(K.hop('A', 'B'), K.hop('A', 'C'))
      + K.dummyStep('A', 0, 0) + K.dummyStep('B', 10, 0) + K.dummyStep('C', 20, 0);
    const after = K.order(K.hop('A', 'B')) + K.dummyStep('A', 0, 0) + K.dummyStep('B', 10, 0);
    const cs = compare(before, after);
    expect(sorted(kinds(cs))).toEqual(sorted(['step_removed', 'hop_removed']));
    const hop = byKind(cs, 'hop_removed');
    expect(hop.fromStep).toBe('A');
    expect(hop.toStep).toBe('C');
    expect(hop.before).toBe(true);
    expect(hop.after).toBe(false);
  });

  it('exactRenameProducesOnlyStepRenamed_neverAddRemoveOrHopChurn', () => {
    const before = K.order(K.hop('Gen', 'Old Select'), K.hop('Old Select', 'Out'))
      + K.rowGenStep('Gen', 'F', 'String', '10', 0, 0)
      + K.selectValuesStep('Old Select', 'String', '20', 10, 0)
      + K.dummyStep('Out', 20, 0);
    const after = K.order(K.hop('Gen', 'New Select'), K.hop('New Select', 'Out'))
      + K.rowGenStep('Gen', 'F', 'String', '10', 0, 0)
      + K.selectValuesStep('New Select', 'String', '20', 10, 0)
      + K.dummyStep('Out', 20, 0);
    const cs = compare(before, after);
    expect(kinds(cs)).toEqual(['step_renamed']);
    const rename = cs.changes[0]!;
    expect(rename.beforeName).toBe('Old Select');
    expect(rename.afterName).toBe('New Select');
    expect(rename.section).toBe('identity');
    expect(rename.property).toBe('name');
  });

  it('renameWithInternalChangeKeepsLogicalIdentityAndReportsBoth', () => {
    const before = K.order(K.hop('Gen', 'Old Select'))
      + K.rowGenStep('Gen', 'F', 'String', '10', 0, 0)
      + K.selectValuesStep('Old Select', 'String', '20', 10, 0);
    const after = K.order(K.hop('Gen', 'New Select'))
      + K.rowGenStep('Gen', 'F', 'String', '10', 0, 0)
      + K.selectValuesStep('New Select', 'String', '50', 10, 0);
    const cs = compare(before, after);
    expect(sorted(kinds(cs))).toEqual(sorted(['step_renamed', 'field_property_changed']));
    const fieldChange = byKind(cs, 'field_property_changed');
    // internal changes of a renamed step are reported under the after name
    expect(fieldChange.stepName).toBe('New Select');
    expect(fieldChange.field).toBe('CUSTOMER_CODE');
    expect(fieldChange.property).toBe('length');
    expect(String(fieldChange.before)).toBe('20');
    expect(String(fieldChange.after)).toBe('50');
    // no hop changes despite the endpoint name changing in XML
    expect(kinds(cs)).not.toContain('hop_added');
    expect(kinds(cs)).not.toContain('hop_removed');
    // the rename and the internal change share the logical identity of the step
    expect(fieldChange.logicalId).not.toBeNull();
    expect(byKind(cs, 'step_renamed').logicalId).toBe(fieldChange.logicalId);
  });

  it('movedStepIsLayoutAndQuickHidesItWithoutDeletingIt', () => {
    const cs = compare(K.dummyStep('A', 100, 100), K.dummyStep('A', 400, 300));
    expect(kinds(cs)).toEqual(['step_moved']);
    const moved = cs.changes[0]!;
    expect(moved.classification).toBe('layout');
    expect(moved.before).toBe('100,100');
    expect(moved.after).toBe('400,300');

    const quick = applyMode(cs, { ...defaultConfig(), mode: 'quick' });
    expect(quick.visible).toHaveLength(0);
    expect(quick.hidden).toHaveLength(1);
    expect(quick.changeSet.changes).toHaveLength(1); // never deleted

    expect(applyMode(cs, advancedConfig()).visible).toHaveLength(1);
  });

  it('hopTargetChangeProducesRemovedPlusAdded', () => {
    const before = K.order(K.hop('A', 'B'))
      + K.dummyStep('A', 0, 0) + K.dummyStep('B', 10, 0) + K.dummyStep('C', 20, 0);
    const after = K.order(K.hop('A', 'C'))
      + K.dummyStep('A', 0, 0) + K.dummyStep('B', 10, 0) + K.dummyStep('C', 20, 0);
    expect(sorted(kinds(compare(before, after)))).toEqual(sorted(['hop_removed', 'hop_added']));
  });

  it('hopEnabledFlagChangeIsHopChanged', () => {
    const before = K.order(K.hop('A', 'B')) + K.dummyStep('A', 0, 0) + K.dummyStep('B', 10, 0);
    const after = K.order('    <hop><from>A</from><to>B</to><enabled>N</enabled></hop>\n')
      + K.dummyStep('A', 0, 0) + K.dummyStep('B', 10, 0);
    const cs = compare(before, after);
    expect(kinds(cs)).toEqual(['hop_changed']);
    expect(cs.changes[0]!.property).toBe('enabled');
  });

  it('selectValuesTypeChangeIsReportedPerFieldAndProperty', () => {
    const cs = compare(
      K.selectValuesStep('Select Fields', 'String', '20', 0, 0),
      K.selectValuesStep('Select Fields', 'None', '20', 0, 0));
    expect(cs.changes).toHaveLength(1);
    const c = cs.changes[0]!;
    expect(c.kind).toBe('field_property_changed');
    expect(c.section).toBe('metadata');
    expect(c.field).toBe('CUSTOMER_CODE');
    expect(c.property).toBe('type');
    expect(c.before).toBe('String');
    expect(c.after).toBe('None');
    expect(c.classification).toBe('functional');
  });

  it('filterConditionValueChangeIsFilterChanged', () => {
    const cs = compare(
      K.filterRowsStep('Filter', 'AGE', '&gt;=', 'Integer', '18', 0, 0),
      K.filterRowsStep('Filter', 'AGE', '&gt;=', 'Integer', '21', 0, 0));
    expect(cs.changes).toHaveLength(1);
    const c = cs.changes[0]!;
    expect(c.kind).toBe('filter_changed');
    expect(c.section).toBe('condition');
    expect(c.field).toBe('AGE');
    expect(c.property).toBe('value');
    expect(String(c.before)).toBe('18');
    expect(String(c.after)).toBe('21');
  });

  it('sqlChangeCarriesAddedFragments', () => {
    const cs = compare(
      K.tableInputStep('Read', 'SELECT a\nFROM t\nWHERE active = 1', 'DB', 0, 0),
      K.tableInputStep('Read', 'SELECT a\nFROM t\nWHERE active = 1\nAND deleted = 0', 'DB', 0, 0));
    expect(cs.changes).toHaveLength(1);
    const c = cs.changes[0]!;
    expect(c.kind).toBe('sql_changed');
    expect(c.property).toBe('query');
    expect(c.classification).toBe('functional');
    expect(c.addedFragments.join('\n')).toContain('AND deleted = 0');
    expect(c.removedFragments).toHaveLength(0);
  });

  it('whitespaceOnlySqlChangeIsFormattingMetadataWhenConfigured', () => {
    const cs = compare(
      K.tableInputStep('Read', 'SELECT a FROM t', 'DB', 0, 0),
      K.tableInputStep('Read', 'SELECT a\n    FROM t', 'DB', 0, 0));
    expect(cs.changes).toHaveLength(1);
    const c = cs.changes[0]!;
    expect(c.kind).toBe('sql_changed');
    expect(c.property).toBe('formatting');
    expect(c.classification).toBe('metadata');
  });

  it('scriptChangeCarriesAddedFragment', () => {
    const cs = compare(
      K.scriptStep('Normalize', 'OUT = X.trim();', 0, 0),
      K.scriptStep('Normalize', 'OUT = X.trim().toUpperCase();', 0, 0));
    expect(cs.changes).toHaveLength(1);
    const c = cs.changes[0]!;
    expect(c.kind).toBe('script_changed');
    expect(c.property).toBe('source');
    expect(c.addedFragments.join('\n')).toContain('.toUpperCase()');
  });

  it('unknownTagAppearingInsideAStepIsUnknownChange', () => {
    const cs = compare(
      K.dummyStep('A', 0, 0),
      K.step('A', 'Dummy', 0, 0, '    <custom_company_flag>demo</custom_company_flag>\n'));
    expect(cs.changes).toHaveLength(1);
    const c = cs.changes[0]!;
    expect(c.kind).toBe('unknown_change');
    expect(c.classification).toBe('unknown');
    expect(c.property).toBe('custom_company_flag');
    expect(c.before).toBeNull();
    expect(c.after).toBe('demo');
    expect(c.sourceXmlPath?.trim()).toBeTruthy();
  });

  it('unsupportedStepTypesAreStillComparedViaGenericFallback', () => {
    // RowGenerator has no specific adapter: keyed field collections still produce field-level
    // changes instead of being ignored.
    const cs = compare(
      K.rowGenStep('Gen', 'CUSTOMER_ID', 'String', '10', 0, 0),
      K.rowGenStep('Gen', 'CUSTOMER_ID', 'String', '25', 0, 0));
    expect(cs.changes).toHaveLength(1);
    const c = cs.changes[0]!;
    expect(c.kind).toBe('field_property_changed');
    expect(c.field).toBe('CUSTOMER_ID');
    expect(c.property).toBe('length');
  });

  it('invalidXmlYieldsControlledError', () => {
    const cs = compareDocuments(
      { name: 'b', content: K.transformation('t', K.dummyStep('A', 0, 0)) },
      { name: 'a', content: 'This is not a valid XML document.' },
      advancedConfig());
    expect(changeSetResult(cs)).toBe('error');
    expect(cs.errors).toHaveLength(1);
    expect(cs.errors[0]!.code).toBe('invalid_xml');
    expect(cs.errors[0]!.side).toBe('after');
  });

  it('oversizedInputYieldsFileTooLarge', () => {
    const tiny = { ...advancedConfig(), maxFileBytes: 64 };
    const cs = compareDocuments(
      { name: 'b', content: K.transformation('t', K.dummyStep('A', 0, 0)) },
      { name: 'a', content: K.transformation('t', K.dummyStep('A', 0, 0)) },
      tiny);
    expect(changeSetResult(cs)).toBe('error');
    expect(cs.errors.length).toBeGreaterThan(0);
    expect(cs.errors[0]!.code).toBe('file_too_large');
    expect(cs.errors.map((e) => e.side)).toEqual(['before', 'after']);
  });

  it('outputIsDeterministicAcrossRuns', () => {
    const before = K.order(K.hop('A', 'B'))
      + K.selectValuesStep('A', 'String', '20', 0, 0)
      + K.dummyStep('B', 10, 0)
      + K.notepads();
    const after = K.order(K.hop('A', 'C'))
      + K.selectValuesStep('A', 'None', '50', 5, 5)
      + K.dummyStep('C', 20, 0)
      + K.rowGenStep('D', 'X', 'String', '1', 30, 0);
    const first = renderJson(compare(before, after), advancedConfig());
    const second = renderJson(compare(before, after), advancedConfig());
    expect(second).toBe(first);
    // ids follow the sorted order
    const ids = (JSON.parse(first) as { changes: { id: string }[] }).changes.map((c) => c.id);
    expect(ids).toEqual(ids.map((_, i) => 'c' + (i + 1)));
  });

  it('graphViewCarriesIdentitiesPositionsAndStatuses', () => {
    const before = K.order(K.hop('Gen', 'Old'))
      + K.rowGenStep('Gen', 'F', 'String', '10', 0, 0)
      + K.selectValuesStep('Old', 'String', '20', 100, 100);
    const after = K.order(K.hop('Gen', 'New'))
      + K.rowGenStep('Gen', 'F', 'String', '10', 0, 0)
      + K.selectValuesStep('New', 'String', '20', 200, 150)
      + K.dummyStep('Fresh', 300, 0);
    const cs = compare(before, after);
    expect(cs.graph.steps).toHaveLength(3);
    const renamed = cs.graph.steps.find((s) => s.status === 'renamed')!;
    expect(renamed.beforeName).toBe('Old');
    expect(renamed.afterName).toBe('New');
    expect(renamed.beforeX).toBe(100);
    expect(renamed.afterX).toBe(200);
    expect(renamed.logicalId?.trim()).toBeTruthy();
    const addedStep = cs.graph.steps.find((s) => s.status === 'added')!;
    expect(addedStep.afterName).toBe('Fresh');
    expect(addedStep.beforeX).toBeNull();
    expect(cs.graph.hops.length).toBeGreaterThan(0);
  });

  it('engineIsSafeUnderConcurrentUse: repeated calls share no state', () => {
    // JS has no shared-memory threads here; the property that matters is statelessness.
    const before = K.transformation('t', K.selectValuesStep('S', 'String', '20', 0, 0));
    const after = K.transformation('t', K.selectValuesStep('S', 'None', '20', 0, 0));
    const run = (): string => renderJson(
      compareDocuments({ name: 'b', content: before }, { name: 'a', content: after }, advancedConfig()),
      advancedConfig());
    const reference = run();
    for (let i = 0; i < 32; i++) expect(run()).toBe(reference);
  });

  it('byte input with a size above the limit is rejected per side', () => {
    const big = encodeUtf8(K.transformation('t', K.dummyStep('A', 0, 0)));
    const cs = compareDocuments({ name: 'b', content: K.transformation('t', '') }, { name: 'a', content: big },
      { ...advancedConfig(), maxFileBytes: big.length - 1 });
    expect(cs.errors.map((e) => [e.code, e.side])).toEqual([['file_too_large', 'after']]);
  });

  it('different document types are unsupported', () => {
    const job = '<job><name>j</name></job>';
    const cs = compareDocuments({ name: 'b', content: K.transformation('t', '') }, { name: 'a', content: job });
    expect(cs.errors.map((e) => e.code)).toEqual(['unsupported_document']);
  });
});

describe('DiffEngine: notes, connections, document properties', () => {
  it('noteLifecycleAndSeparationOfTextAndPosition', () => {
    const noteA = K.notepads(K.notepad('hello world', 10, 10));
    const movedNote = K.notepads(K.notepad('hello world', 300, 200));
    const editedNote = K.notepads(K.notepad('hello universe', 10, 10));
    const noNote = K.notepads();
    const body = K.dummyStep('A', 0, 0);
    const run = (b: string, a: string): ChangeSet => compareDocuments(
      { name: 'b', content: K.transformationWithNotes('t', b, body) },
      { name: 'a', content: K.transformationWithNotes('t', a, body) },
      advancedConfig());

    const added = run(noNote, noteA);
    expect(kinds(added)).toEqual(['note_added']);
    expect(added.changes[0]!.classification).toBe('metadata');

    const moved = run(noteA, movedNote);
    expect(kinds(moved)).toEqual(['note_moved']);
    expect(moved.changes[0]!.classification).toBe('layout');

    const edited = run(noteA, editedNote);
    expect(kinds(edited)).toEqual(['note_changed']);
    expect(edited.changes[0]!.property).toBe('text');
  });

  it('connectionPasswordChangeIsRedactedEverywhere: JSON (text/HTML renderers arrive in F4)', () => {
    const before = K.connection('DEMO_DB', 'localhost', 'Encrypted aabbcc')
      + K.tableInputStep('Read', 'SELECT 1', 'DEMO_DB', 0, 0);
    const after = K.connection('DEMO_DB', 'localhost', 'Encrypted ddeeff')
      + K.tableInputStep('Read', 'SELECT 1', 'DEMO_DB', 0, 0);
    const cs = compare(before, after);
    expect(cs.changes).toHaveLength(1);
    const c = cs.changes[0]!;
    expect(c.kind).toBe('connection_changed');
    expect(c.property).toBe('password');
    expect(c.before).toBe('[REDACTED]');
    expect(c.after).toBe('[REDACTED]');
    expect(c.classification).toBe('functional'); // used connection

    const json = renderJson(cs, { ...advancedConfig(), showRawDiff: true, showXmlPaths: true });
    expect(json).not.toContain('aabbcc');
    expect(json).not.toContain('ddeeff');
  });

  it('unusedConnectionChangeIsConfigurationUsedIsFunctional', () => {
    const beforeUnused = K.connection('SPARE_DB', 'localhost', 'Encrypted x') + K.dummyStep('A', 0, 0);
    const afterUnused = K.connection('SPARE_DB', 'db.internal', 'Encrypted x') + K.dummyStep('A', 0, 0);
    const cs = compare(beforeUnused, afterUnused);
    expect(cs.changes).toHaveLength(1);
    expect(cs.changes[0]!.property).toBe('server');
    expect(cs.changes[0]!.classification).toBe('configuration');
  });

  it('connectionAddedRemovedAndRenamedAreFirstClass', () => {
    const none = K.dummyStep('A', 0, 0);
    const one = K.connection('NEW_DB', 'h', 'Encrypted x') + K.dummyStep('A', 0, 0);
    const added = compare(none, one);
    expect(kinds(added)).toEqual(['connection_added']);
    expect(added.changes[0]!.afterName).toBe('NEW_DB');

    expect(kinds(compare(one, none))).toEqual(['connection_removed']);

    const renamed = K.connection('RENAMED_DB', 'h', 'Encrypted x') + K.dummyStep('A', 0, 0);
    const ren = compare(one, renamed);
    expect(kinds(ren)).toEqual(['connection_renamed']);
    expect(ren.changes[0]!.beforeName).toBe('NEW_DB');
    expect(ren.changes[0]!.afterName).toBe('RENAMED_DB');
  });

  it('info property, parameter and unknown root tag changes are classified', () => {
    const doc = (desc: string, def: string, extra: string): string => '<transformation>\n'
      + '  <info><name>t</name><description>' + desc + '</description>'
      + '<parameters><parameter><name>P</name><default_value>' + def + '</default_value></parameter></parameters>'
      + '<modified_date>2020</modified_date></info>\n'
      + K.dummyStep('A', 0, 0) + extra + '</transformation>\n';
    const cs = compare2(doc('d1', '1', ''), doc('d2', '2', '<future_tag>x</future_tag>'));
    const summary = cs.changes.map((c) => [c.kind, c.classification, c.section, c.property]);
    expect(summary).toEqual([
      ['transformation_property_changed', 'metadata', 'info', 'description'],
      ['transformation_property_changed', 'functional', 'parameters', 'default_value'],
      ['unknown_change', 'unknown', 'unknown', 'future_tag'],
    ]);
    const volatileOnly = compare2(doc('d', '1', ''), doc('d', '1', '').replace('2020', '2021'));
    expect(volatileOnly.changes.map((c) => [c.section, c.volatile])).toEqual([['storage', true]]);
    expect(changeSetResult(volatileOnly)).toBe('unchanged');
  });
});

function compare2(before: string, after: string): ChangeSet {
  return compareDocuments({ name: 'b', content: before }, { name: 'a', content: after }, advancedConfig());
}

// Port of PentahoDocumentsTest (KJB/KDB projected into the shared model).
function job(name: string, x: number, filename: string): string {
  return '<job><name>Demo</name><entries><entry><name>Start</name><type>SPECIAL</type><nr>0</nr><start>Y</start><xloc>0</xloc><yloc>0</yloc></entry>'
    + '<entry><name>' + name + '</name><type>TRANS</type><nr>0</nr><filename>' + filename + '</filename><xloc>' + x + '</xloc><yloc>10</yloc></entry>'
    + '</entries><hops><hop><from>Start</from><to>' + name + '</to><enabled>Y</enabled><evaluation>Y</evaluation><unconditional>N</unconditional></hop></hops></job>';
}

describe('PentahoDocuments', () => {
  it('jobsRecognizeRenameMoveAndStableHopsWithOriginalPaths', () => {
    const cs = compare2(job('Old', 10, '${DIR}/child.ktr'), job('New', 800, '${DIR}/child.ktr'));
    expect(cs.errors).toHaveLength(0);
    expect(cs.metadata.get('documentType')).toBe('job');
    expect(sorted(cs.changes.map((c) => c.kind))).toEqual(sorted(['step_renamed', 'step_moved']));
    for (const c of cs.changes) {
      expect(c.sourceXmlPath?.startsWith('/job/entries')).toBe(true);
      expect(c.logicalId).not.toBeNull();
    }
  });

  it('jobTargetsAndConditionalLinksAreFunctionalAndNeverExecuted', () => {
    const before = job('Transform', 10, '${DIR}/child.ktr');
    const cs = compare2(before, before.replace('child.ktr', 'other.ktr').replace('<evaluation>Y', '<evaluation>N'));
    expect(cs.changes).toHaveLength(2);
    for (const c of cs.changes) expect(c.classification).toBe('functional');
    expect(cs.changes.map((c) => c.property)).toEqual(expect.arrayContaining(['filename', 'evaluation']));
  });

  it('kdbConnectionPropertiesAndPasswordsAreComparedSafely', () => {
    const b = '<connection><name>DB</name><server>old</server><password>secret-before</password></connection>';
    const cs = compare2(b, b.replace('old', 'new').replace('secret-before', 'secret-after'));
    expect(cs.errors).toHaveLength(0);
    expect(cs.changes).toHaveLength(2);
    expect(cs.metadata.get('documentType')).toBe('connection');
    const json = renderJson(cs, advancedConfig());
    expect(json).toContain('[REDACTED]');
    expect(json).not.toContain('secret-before');
    expect(json).not.toContain('secret-after');
  });

  it('layoutOptionsNeverChangeMatchingAndFieldNamesCannotCollideWithStepIdentity', () => {
    const b = K.transformation('T', K.selectValuesStep('Old', 'String', '20', 0, 0));
    const a = b.replace('<name>Old', '<name>New').replace('<xloc>0', '<xloc>9000');
    const quick = compareDocuments({ name: 'b', content: b }, { name: 'a', content: a }, defaultConfig());
    const customConfig = { ...withInclude({ ...defaultConfig(), mode: 'custom' as const }, 'layout', true), layoutStepPositions: true };
    const custom = compareDocuments({ name: 'b', content: b }, { name: 'a', content: a }, customConfig);
    expect(sorted(quick.changes.map((c) => c.kind))).toEqual(sorted(custom.changes.map((c) => c.kind)));
    expect(custom.changes.some((c) => c.kind === 'step_added' || c.kind === 'step_removed')).toBe(false);
  });

  it('standaloneConnectionRenameWithHostEditIsNotAdditionAndRemoval', () => {
    const b = '<connection><name>Old</name><server>old-host</server></connection>';
    const cs = compare2(b, b.replace('Old', 'New').replace('old-host', 'new-host'));
    expect(sorted(cs.changes.map((c) => c.kind))).toEqual(sorted(['connection_renamed', 'connection_changed']));
  });

  it('mergeJoinSortAndOutputChangesHaveReadablePropertiesRatherThanUnknownXml', () => {
    const types = ['MergeJoin', 'SortRows', 'TableOutput', 'GroupBy', 'GetVariable', 'Rest'];
    const body = ['<keys_1><key>A</key></keys_1>', '<fields><field><name>A</name><ascending>Y</ascending></field></fields>',
      '<lookup><name>A</name></lookup><table>A</table>', '<group><field><name>A</name></field></group>',
      '<fields><field><name>A</name><variable>${A}</variable></field></fields>', '<url>${A}</url>'];
    types.forEach((type, i) => {
      const b = K.transformation('T', K.step('S', type, 0, 0, body[i]!));
      const cs = compare2(b, b.replaceAll('>A<', '>B<').replaceAll('${A}', '${B}').replaceAll('>Y<', '>N<'));
      expect(cs.changes.length, type).toBeGreaterThan(0);
      expect(cs.changes.some((c) => c.kind === 'unknown_change'), type).toBe(false);
    });
  });

  it('unknownPluginsAndExtensionsStillRemainExplicit', () => {
    const b = '<job><name>T</name><entries><entry><name>X</name><type>FUTURE</type></entry></entries></job>';
    const cs = compare2(b, b.replace('</entry>', '<unrecognized><v>2</v></unrecognized></entry>'));
    expect(cs.changes.some((c) => c.kind === 'unknown_change')).toBe(true);
  });
});
