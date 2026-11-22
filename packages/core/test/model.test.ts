import { describe, expect, it } from 'vitest';
import {
  CHANGE_KINDS, CLASSIFICATIONS, change, changeFrom, classificationFromId, ordinal,
} from '../src/model/change.ts';
import { changeSet, changeSetResult, classificationSummary } from '../src/model/change-set.ts';
import { HopModel, NoteModel, StepModel } from '../src/model/document.ts';
import { diffError, diffErrorToString } from '../src/model/errors.ts';
import { PentahoVersion } from '../src/model/pentaho-version.ts';

describe('model', () => {
  it('keeps the Java enum declaration order for ordinal sorting', () => {
    expect(ordinal(CHANGE_KINDS, 'step_added')).toBe(0);
    expect(ordinal(CHANGE_KINDS, 'unknown_change')).toBe(24);
    expect(ordinal(CLASSIFICATIONS, 'potentially-functional')).toBe(4);
    expect(classificationFromId('potentially_functional')).toBe('potentially-functional');
    expect(() => classificationFromId('nope')).toThrow('Unknown classification: nope');
  });

  it('builds changes with null defaults and copied fragment lists', () => {
    const fragments = ['a'];
    const c = change('sql_changed', 'functional', 'step').stepName('S').addedFragments(fragments).build();
    fragments.push('b');
    expect(c.addedFragments).toEqual(['a']);
    expect(c.before).toBeNull();
    expect(c.confidence).toBeNull();
    expect(c.volatile).toBe(false);
    const copy = changeFrom(c).id('step:S:sql').build();
    expect(copy).toEqual({ ...c, id: 'step:S:sql' });
  });

  it('derives result and summary ignoring volatile changes', () => {
    const vol = change('transformation_property_changed', 'metadata', 'transformation').volatileChange(true).build();
    const only = changeSet([vol], [], [], [], new Map());
    expect(changeSetResult(only)).toBe('unchanged');
    expect(classificationSummary(only).get('metadata')).toBe(0);
    const fn = change('step_added', 'functional', 'step').build();
    expect(changeSetResult(changeSet([vol, fn], [], [], [], new Map()))).toBe('changed');
    const err = changeSet([fn], [], [diffError('invalid_xml', 'bad', 'before')], [], new Map());
    expect(changeSetResult(err)).toBe('error');
    expect(diffErrorToString(err.errors[0]!)).toBe('invalid_xml (before): bad');
  });

  it('trims identities with Java trim and formats labels', () => {
    const s = new StepModel('Step\n', ' TableInput ', null, null, 5);
    expect(s.name).toBe('Step');
    expect(s.type).toBe('TableInput');
    expect(s.positionString()).toBe('?,5');
    expect(new StepModel(' A', null, null, null, null).name).toBe(' A');
    expect(new HopModel(' a ', 'b\n', false).toString()).toBe('a -> b (disabled)');
    expect(new NoteModel('  one\n\ttwo  ', null, null, null, null, null).label()).toBe('one two');
    expect(new NoteModel('x'.repeat(41), null, null, null, null, null).label()).toBe('x'.repeat(37) + '...');
  });

  it('parses Pentaho versions like PentahoVersion.parse', () => {
    const v = PentahoVersion.parse(' pdi-9.4.0.0-343 ')!;
    expect([v.major, v.minor, v.patch, v.build, v.raw]).toEqual([9, 4, 0, '343', 'pdi-9.4.0.0-343']);
    expect(PentahoVersion.parse('   ')).toBeNull();
    const partial = PentahoVersion.parse('10.x')!;
    expect([partial.major, partial.minor, partial.patch]).toEqual([10, null, null]);
    expect(PentahoVersion.parse('9.4')!.sameMajorMinor(PentahoVersion.parse('9.4.1.0'))).toBe(true);
    expect(PentahoVersion.parse('9')!.sameMajorMinor(PentahoVersion.parse('9.3'))).toBe(true);
    expect(PentahoVersion.parse('9.4')!.sameMajorMinor(PentahoVersion.parse('10.4'))).toBe(false);
  });
});
