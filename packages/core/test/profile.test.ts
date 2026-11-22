import { describe, expect, it } from 'vitest';
import {
  advancedConfig, applyMode, defaultConfig, hiddenCounts, mergeConfig, modeFromId, withInclude,
  type DiffConfig,
} from '../src/index.ts';
import { change, type Change, type ChangeKind } from '../src/model/change.ts';
import { changeSet, type ChangeSet } from '../src/model/change-set.ts';

function cs(...changes: Change[]): ChangeSet {
  return changeSet(changes, [], [], [], new Map());
}

const functional = (): Change =>
  change('sql_changed', 'functional', 'step').stepName('S').property('query').build();
const layoutMove = (): Change =>
  change('step_moved', 'layout', 'step').stepName('S').property('position').build();
const noteText = (): Change => change('note_changed', 'metadata', 'note').property('text').build();
const noteMove = (): Change => change('note_moved', 'layout', 'note').property('position').build();
const volatileStorage = (): Change =>
  change('transformation_property_changed', 'metadata', 'transformation')
    .property('modified_date').volatileChange(true).build();
const unknown = (): Change => change('unknown_change', 'unknown', 'xml').property('mystery').build();
const sqlFormatting = (): Change =>
  change('sql_changed', 'metadata', 'step').stepName('S').property('formatting').build();

const kinds = (list: readonly Change[]): ChangeKind[] => list.map((c) => c.kind);

// Ported from ktrdiff-core ModeFilterTest.
describe('ModeFilter (ported)', () => {
  it('quickShowsFunctionalNotesAndUnknownButHidesLayoutVolatileAndFormatting', () => {
    const set = cs(functional(), layoutMove(), noteText(), noteMove(), volatileStorage(), unknown(), sqlFormatting());
    const quick = applyMode(set, { ...defaultConfig(), mode: 'quick' });
    expect(kinds(quick.visible).sort()).toEqual(['note_changed', 'sql_changed', 'unknown_change']);
    expect(quick.hidden).toHaveLength(4);
    expect(hiddenCounts(quick).get('layout')).toBe(2);
    expect(hiddenCounts(quick).get('metadata')).toBe(2);
    // the underlying ChangeSet is intact
    expect(quick.changeSet.changes).toHaveLength(7);
  });

  it('advancedShowsEverythingIncludingVolatile', () => {
    const set = cs(functional(), layoutMove(), volatileStorage(), sqlFormatting());
    const advanced = applyMode(set, advancedConfig());
    expect(advanced.visible).toHaveLength(4);
    expect(advanced.hidden).toHaveLength(0);
  });

  it('customFollowsIncludeMapAndFineGrainedSwitches', () => {
    const set = cs(functional(), layoutMove(), noteMove(), noteText(), unknown());
    let custom: DiffConfig = withInclude({ ...defaultConfig(), mode: 'custom' }, 'layout', true);
    custom = {
      ...custom, layoutStepPositions: true, layoutNotePositions: false, notesContent: false,
    };
    custom = withInclude(custom, 'unknown', false);
    const filtered = applyMode(set, custom);
    // step move allowed, note move blocked by note_positions, note text blocked by
    // notes.content, unknown blocked by include map
    expect(kinds(filtered.visible).sort()).toEqual(['sql_changed', 'step_moved']);
  });

  it('unknownIsNeverSilentlyRemovedFromTheChangeSet', () => {
    const set = cs(unknown());
    const custom = applyMode(set, withInclude({ ...defaultConfig(), mode: 'custom' }, 'unknown', false));
    expect(custom.visible).toHaveLength(0);
    expect(custom.hidden).toHaveLength(1);
    expect(custom.changeSet.changes).toHaveLength(1);
  });
});

describe('ModeFilter extras', () => {
  it('custom hides volatile changes and renames when showRenames is off', () => {
    const rename = change('step_renamed', 'metadata', 'step').stepName('S').build();
    const filtered = applyMode(cs(rename, volatileStorage()), { ...defaultConfig(), mode: 'custom', showRenames: false });
    expect(filtered.visible).toHaveLength(0);
    expect(filtered.mode).toBe('custom');
  });

  it('quick hides whitespace-only script changes', () => {
    const ws = change('script_changed', 'metadata', 'step').property('whitespace').build();
    expect(applyMode(cs(ws), defaultConfig()).visible).toHaveLength(0);
  });

  it('hiddenCounts follows the classification enum order', () => {
    const filtered = applyMode(cs(unknown(), layoutMove(), sqlFormatting()),
      withInclude(withInclude({ ...defaultConfig(), mode: 'custom' }, 'unknown', false), 'metadata', false));
    expect([...hiddenCounts(filtered).keys()]).toEqual(['layout', 'metadata', 'unknown']);
  });
});

describe('DiffConfig', () => {
  it('has the Java defaults', () => {
    const d = defaultConfig();
    expect(d.mode).toBe('quick');
    expect(d.include).toEqual({
      functional: true, layout: false, metadata: true, configuration: true,
      'potentially-functional': true, unknown: true,
    });
    expect(d.maxFileBytes).toBe(52428800);
    expect(d.renameThreshold).toBe(0.7);
    expect(d.failOn).toBe('none');
    expect(d.sqlIgnoreFormatting).toBe(true);
    expect(d.scriptsIgnoreWhitespace).toBe(false);
    expect(d.notesContent).toBe(true);
    expect(d.showRenames).toBe(true);
  });

  it('modeFromId is case-insensitive and keeps the Java error text', () => {
    expect(modeFromId('ADVANCED')).toBe('advanced');
    expect(modeFromId('Custom')).toBe('custom');
    // Java equalsIgnoreCase folds the Kelvin sign to k
    expect(modeFromId('quicK')).toBe('quick');
    expect(() => modeFromId('fast')).toThrow('Unknown mode: fast (use quick, advanced or custom)');
  });
});

describe('mergeConfig (ConfigLoader.merge)', () => {
  it('applies every supported key', () => {
    const merged = mergeConfig(defaultConfig(), {
      mode: 'custom',
      include: { layout: true, potentially_functional: false },
      layout: { step_positions: true, note_positions: true },
      notes: { content: false },
      sql: { ignore_formatting: false },
      scripts: { ignore_whitespace: true },
      output: { show_xml_paths: true, show_raw_diff: true },
      matching: { rename_threshold: 0.8 },
      renames: { show: false },
      fail_on: 'functional',
      limits: { max_file_mb: 3 },
    });
    expect(merged).toEqual({
      ...defaultConfig(),
      mode: 'custom',
      include: { ...defaultConfig().include, layout: true, 'potentially-functional': false },
      layoutStepPositions: true,
      layoutNotePositions: true,
      notesContent: false,
      sqlIgnoreFormatting: false,
      scriptsIgnoreWhitespace: true,
      showXmlPaths: true,
      showRawDiff: true,
      renameThreshold: 0.8,
      showRenames: false,
      failOn: 'functional',
      maxFileBytes: 3 * 1024 * 1024,
    });
  });

  it('ignores null roots, null values, non-object sections and unknown keys', () => {
    const base = defaultConfig();
    expect(mergeConfig(base, null)).toBe(base);
    expect(mergeConfig(base, { mode: null, layout: 'x', notes: [true], extra: 1, fail_on: null })).toEqual(base);
  });

  it('does not mutate the base config', () => {
    const base = defaultConfig();
    mergeConfig(base, { include: { layout: true }, mode: 'advanced' });
    expect(base).toEqual(defaultConfig());
  });

  it('replicates Jackson coercions', () => {
    const m = mergeConfig(defaultConfig(), {
      notes: { content: ' false ' },
      sql: { ignore_formatting: 'yes' }, // not "true" -> false
      scripts: { ignore_whitespace: 1 },
      output: { show_xml_paths: 1.5 }, // floating-point -> false
      matching: { rename_threshold: ' 0.9d ' },
      limits: { max_file_mb: '2.9' },
      fail_on: 5,
      include: { unknown: null },
    });
    expect(m.notesContent).toBe(false);
    expect(m.sqlIgnoreFormatting).toBe(false);
    expect(m.scriptsIgnoreWhitespace).toBe(true);
    expect(m.showXmlPaths).toBe(false);
    expect(m.renameThreshold).toBe(0.9);
    expect(m.maxFileBytes).toBe(2 * 1024 * 1024);
    expect(m.failOn).toBe('5');
    expect(m.include.unknown).toBe(false);
    expect(mergeConfig(defaultConfig(), { matching: { rename_threshold: 'abc' } }).renameThreshold).toBe(0);
    expect(mergeConfig(defaultConfig(), { limits: { max_file_mb: true } }).maxFileBytes).toBe(1024 * 1024);
  });

  it('rejects unknown modes and classifications', () => {
    expect(() => mergeConfig(defaultConfig(), { mode: 'nope' })).toThrow('Unknown mode: nope');
    expect(() => mergeConfig(defaultConfig(), { include: { colour: true } })).toThrow('Unknown classification: colour');
  });
});
