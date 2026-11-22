// Port of ExpectedMatcherTest (7).
import { describe, expect, it } from 'vitest';
import type { Change, ChangeSet } from '@ktrdiff/core';
import { change } from '../../core/src/model/change.ts';
import { changeSet as makeChangeSet } from '../../core/src/model/change-set.ts';
import { looseEquals, matches, verify } from '../src/fixtures/matcher.ts';
import { emptyExpectedChange, emptySpec } from '../src/fixtures/spec.ts';

const changeSet = (...changes: Change[]): ChangeSet => makeChangeSet(changes, [], [], [], new Map());

describe('ExpectedMatcher', () => {
  it('looseScalarEquality: YAML numbers, Pentaho booleans and doubles compare as text', () => {
    expect(looseEquals(18, '18')).toBe(true);
    expect(looseEquals('18', 18)).toBe(true);
    expect(looseEquals(true, 'Y')).toBe(true);
    expect(looseEquals(false, 'N')).toBe(true);
    expect(looseEquals(18.0, '18')).toBe(true);
    expect(looseEquals('None', 'None')).toBe(true);
    expect(looseEquals('18', '21')).toBe(false);
  });

  it('onlyNonNullExpectedFieldsAreCompared: absent before/after are not compared', () => {
    const actual = change('step_moved', 'layout', 'step').stepType('SelectValues').stepName('S')
      .section('position').property('position').before('1,1').after('2,2').build();
    const expected = { ...emptyExpectedChange(), kind: 'step_moved', stepName: 'S' };
    expect(matches(expected, actual)).toBe(true);
  });

  it('stepTypeComparesThroughAliases: ModifiedJavaScriptValue matches ScriptValueMod', () => {
    const actual = change('script_changed', 'functional', 'step').stepType('ScriptValueMod').stepName('Normalize')
      .section('script').property('source').addedFragments(['X = X.toUpperCase();']).build();
    const expected = {
      ...emptyExpectedChange(), kind: 'script_changed', stepType: 'ModifiedJavaScriptValue',
      addedContains: ['.toUpperCase()'],
    };
    expect(matches(expected, actual)).toBe(true);
  });

  it('strictModeFailsOnUnexpectedFunctionalChange', () => {
    const spec = { ...emptySpec(), result: 'changed', strict: true, changes: [{ ...emptyExpectedChange(), kind: 'step_added' }] };
    const r = verify(spec, changeSet(
      change('step_added', 'functional', 'step').stepName('A').build(),
      change('sql_changed', 'functional', 'step').stepName('B').property('query').build()));
    expect(r.passed).toBe(false);
    expect(r.problems.some((p) => p.includes('strict'))).toBe(true);
  });

  it('strictModeAllowsExtrasListedInAllowExtraButNeverFunctional', () => {
    const spec = {
      ...emptySpec(), result: 'changed', strict: true,
      // functional must be ignored: it can never be waved through
      allowExtra: ['layout', 'functional'],
      changes: [{ ...emptyExpectedChange(), kind: 'step_added' }],
    };
    expect(verify(spec, changeSet(
      change('step_added', 'functional', 'step').stepName('A').build(),
      change('step_moved', 'layout', 'step').stepName('B').build())).passed).toBe(true);
    expect(verify(spec, changeSet(
      change('step_added', 'functional', 'step').stepName('A').build(),
      change('sql_changed', 'functional', 'step').stepName('B').build())).passed).toBe(false);
  });

  it('volatileChangesAreExemptFromStrictCounting', () => {
    const spec = { ...emptySpec(), result: 'changed', strict: true, changes: [{ ...emptyExpectedChange(), kind: 'step_added' }] };
    expect(verify(spec, changeSet(
      change('step_added', 'functional', 'step').stepName('A').build(),
      change('transformation_property_changed', 'metadata', 'transformation').property('modified_date')
        .volatileChange(true).build())).passed).toBe(true);
  });

  it('unchangedExpectsEmptyNonVolatileChanges', () => {
    const spec = { ...emptySpec(), result: 'unchanged', strict: true };
    expect(verify(spec, changeSet()).passed).toBe(true);
    expect(verify(spec, changeSet(change('step_added', 'functional', 'step').stepName('A').build())).passed).toBe(false);
  });
});
