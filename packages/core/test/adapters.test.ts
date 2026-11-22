import { describe, expect, it } from 'vitest';
import { AdapterRegistry, ComparisonContext, defaultConfig, parseTransformation } from '../src/index.ts';
import { diffDeltas } from '../src/adapters/myers.ts';
import { textDiff } from '../src/adapters/text-diff.ts';
import { describeCondition } from '../src/adapters/filter-rows.ts';
import type { Change } from '../src/model/change.ts';
import type { StepModel } from '../src/model/document.ts';
import type { DiffConfig } from '../src/profile/diff-config.ts';
import * as K from './support/ktrs.ts';

// Expected deltas produced by java-diff-utils 4.12 (DiffUtils.diff(List, List).getDeltas()) with
// a one-off Java run; each character is one line. Format: TYPE srcPos srcLines tgtPos tgtLines;
// A local differential run over 3000 random cases also matched before these were pasted.
const JAR_CASES: readonly (readonly [string, string, string])[] = [
  ['abc', 'cba', 'DELETE 0 ab 0 ;INSERT 3  1 ba;'],
  ['ab', 'ba', 'DELETE 0 a 0 ;INSERT 2  1 a;'],
  ['', 'x', 'INSERT 0  0 x;'],
  ['x', '', 'DELETE 0 x 0 ;'],
  ['', '', ''],
  ['abcabba', 'cbabac', 'DELETE 0 ab 0 ;INSERT 3  1 b;DELETE 5 b 4 ;INSERT 7  5 c;'],
  ['aaa', 'aa', 'DELETE 2 a 2 ;'],
  ['abab', 'baba', 'DELETE 0 a 0 ;INSERT 4  3 a;'],
  ['xay', 'xby', 'CHANGE 1 a 1 b;'],
  ['abcd', 'acbd', 'DELETE 1 b 1 ;INSERT 3  2 b;'],
  ['aXbXc', 'XaXbXcX', 'INSERT 0  0 X;INSERT 5  6 X;'],
  ['abc', 'abc', ''],
  ['ababcbab', 'bbbc', 'DELETE 0 a 0 ;DELETE 2 a 1 ;DELETE 4 c 2 ;CHANGE 6 ab 3 c;'],
  ['acbacb', 'aacc', 'DELETE 1 cb 1 ;CHANGE 5 b 3 c;'],
  ['baacaacc', 'ccab', 'DELETE 0 baa 0 ;DELETE 4 aa 1 ;CHANGE 7 c 2 ab;'],
  ['bccbcabc', 'baba', 'DELETE 1 ccbc 1 ;CHANGE 7 c 3 a;'],
  ['ba', 'accbba', 'INSERT 0  0 acc;INSERT 1  4 b;'],
];

describe('Myers diff (java-diff-utils 4.12 port)', () => {
  it.each(JAR_CASES)('%s -> %s', (a, b, expected) => {
    const got = diffDeltas([...a], [...b])
      .map((d) => `${d.type} ${d.source.position} ${d.source.lines.join('')} ${d.target.position} ${d.target.lines.join('')};`)
      .join('');
    expect(got).toBe(expected);
  });
});

describe('TextDiff', () => {
  it('normalizes newlines and builds the unified text', () => {
    const d = textDiff('SELECT a\r\nFROM t\r\n', 'SELECT a, b\nFROM t\n');
    expect(d.removedLines).toEqual(['SELECT a']);
    expect(d.addedLines).toEqual(['SELECT a, b']);
    expect(d.unified).toBe('- SELECT a\n+ SELECT a, b\n');
  });

  it('treats null and empty as no lines', () => {
    expect(textDiff(null, '').unified).toBe('');
    expect(textDiff('', 'x').addedLines).toEqual(['x']);
  });
});

function stepOf(stepXml: string): StepModel {
  return parseTransformation({ name: 't.ktr', content: K.transformation('t', stepXml) }).steps[0]!;
}

const registry = new AdapterRegistry();

/** Specific adapter followed by the generic pass on the unclaimed tags, as the engine does. */
function compareSteps(b: string, a: string, config: DiffConfig = defaultConfig()): Change[] {
  const before = stepOf(b);
  const after = stepOf(a);
  const ctx = new ComparisonContext(config, after.name, after.type);
  const specific = registry.specificFor(after.type);
  const changes = specific === null ? [] : specific.compare(before, after, ctx);
  changes.push(...registry.generic.compareUnclaimed(before, after, ctx, specific?.claimedTags() ?? new Set()));
  return changes;
}

describe('AdapterRegistry', () => {
  it('dispatches in the Java order and falls back to generic', () => {
    expect(registry.adapterNameFor('SelectValues')).toBe('SelectValuesAdapter');
    expect(registry.adapterNameFor('Modified Java Script Value')).toBe('ScriptValueModAdapter');
    expect(registry.adapterNameFor('SortRows')).toBe('ConfiguredStepAdapter');
    expect(registry.adapterNameFor('TRANS')).toBe('ConfiguredStepAdapter');
    expect(registry.adapterNameFor('Dummy')).toBe('generic');
    // configured schemas match the raw type exactly
    expect(registry.adapterNameFor(' SortRows')).toBe('generic');
  });
});

describe('step adapters', () => {
  it('SelectValues reports meta type and length changes per field', () => {
    const changes = compareSteps(K.selectValuesStep('S', 'String', '20', 0, 0), K.selectValuesStep('S', 'None', '30', 0, 0));
    expect(changes.map((c) => [c.kind, c.classification, c.section, c.field, c.property, c.before, c.after])).toEqual([
      ['field_property_changed', 'functional', 'metadata', 'CUSTOMER_CODE', 'type', 'String', 'None'],
      ['field_property_changed', 'functional', 'metadata', 'CUSTOMER_CODE', 'length', '20', '30'],
    ]);
    expect(changes[0]!.sourceXmlPath).toBe('/transformation/step[1]/fields[1]/meta[1]/type');
  });

  it('TableInput separates formatting-only SQL from query changes', () => {
    const formatting = compareSteps(K.tableInputStep('T', 'SELECT a FROM t', 'db', 0, 0),
      K.tableInputStep('T', 'SELECT a\nFROM   t', 'db', 0, 0));
    expect(formatting.map((c) => [c.kind, c.classification, c.property])).toEqual([['sql_changed', 'metadata', 'formatting']]);
    const query = compareSteps(K.tableInputStep('T', 'SELECT a FROM t', 'db', 0, 0),
      K.tableInputStep('T', 'SELECT b FROM t', 'db2', 0, 0));
    expect(query.map((c) => [c.kind, c.classification, c.property])).toEqual([
      ['sql_changed', 'functional', 'query'],
      ['step_property_changed', 'functional', 'connection'],
    ]);
    expect(query[0]!.addedFragments).toEqual(['SELECT b FROM t']);
    expect(query[0]!.rawDiff).toBe('- SELECT a FROM t\n+ SELECT b FROM t\n');
  });

  it('ScriptValueMod classifies whitespace-only edits by configuration', () => {
    const b = K.scriptStep('J', 'var a = 1;', 0, 0);
    const a = K.scriptStep('J', 'var  a = 1; ', 0, 0);
    expect(compareSteps(b, a).map((c) => [c.kind, c.classification, c.property, c.field]))
      .toEqual([['script_changed', 'functional', 'whitespace', 'Script 1']]);
    const ignoring = compareSteps(b, a, { ...defaultConfig(), scriptsIgnoreWhitespace: true });
    expect(ignoring[0]!.classification).toBe('metadata');
  });

  it('FilterRows compares the condition structure without evaluating it', () => {
    const changes = compareSteps(K.filterRowsStep('F', 'AGE', '>=', 'Integer', '18', 0, 0),
      K.filterRowsStep('F', 'AGE', '>', 'Integer', '21', 0, 0));
    expect(changes.map((c) => [c.kind, c.field, c.property, c.before, c.after])).toEqual([
      ['filter_changed', 'AGE', 'function', '>=', '>'],
      ['filter_changed', 'AGE', 'value', '18', '21'],
    ]);
    const cond = stepOf(K.filterRowsStep('F', 'AGE', '>=', 'Integer', '18', 0, 0)).xml!.child('compare')!.child('condition')!;
    expect(describeCondition(cond)).toBe('AGE >= 18');
  });

  it('configured schemas diff fields by name and the generic pass covers the envelope and layout', () => {
    const changes = compareSteps(K.rowGenStep('G', 'A', 'String', '10', 0, 0), K.rowGenStep('G', 'A', 'Integer', '10', 5, 0));
    expect(changes.map((c) => [c.kind, c.classification, c.section, c.field, c.property])).toEqual([
      ['field_property_changed', 'functional', 'fields', 'A', 'type'],
      ['step_moved', 'layout', 'position', null, 'position'],
    ]);
  });

  it('generic pass: leaf change, unknown tag, empty equals absent', () => {
    const b = K.step('D', 'Dummy', 0, 0, '    <mode>1</mode>\n    <row-meta/>\n');
    const a = K.step('D', 'Dummy', 0, 0, '    <mode>2</mode>\n    <extra><x>1</x></extra>\n');
    expect(compareSteps(b, a).map((c) => [c.kind, c.classification, c.section, c.property, c.before, c.after])).toEqual([
      ['step_property_changed', 'potentially-functional', 'configuration', 'mode', '1', '2'],
      ['unknown_change', 'unknown', 'unknown', 'extra', null, '<extra><x>1</x></extra>'],
    ]);
  });
});
