// Port of UnseenXmlChangesTest (it.ktrdiff.core.engine): synthetic regressions for XmlFallback,
// deliberately independent of golden/private fixtures. Each title starts with the Java method name.
import { describe, expect, it } from 'vitest';
import {
  advancedConfig, applyMode, compareDocuments, defaultConfig, renderHtml, renderJson, renderText,
} from '../src/index.ts';
import type { ChangeSet } from '../src/model/change-set.ts';
import * as K from './support/ktrs.ts';

function compareRaw(before: string, after: string): ChangeSet {
  return compareDocuments({ name: 'before.ktr', content: before }, { name: 'after.ktr', content: after },
    advancedConfig());
}

function compare(beforeBody: string, afterBody: string): ChangeSet {
  return compareRaw(K.transformation('test', beforeBody), K.transformation('test', afterBody));
}

function step(type: string, before: string, after: string): ChangeSet {
  return compare(K.step('Example', type, 0, 0, before), K.step('Example', type, 0, 0, after));
}

const sorted = <T>(xs: readonly T[]): T[] => [...xs].sort();

describe('UnseenXmlChanges', () => {
  it('laterRepeatedLeavesAreNotLost', () => {
    const cs = step('NewPlugin', '<option>one</option><option>two</option>',
      '<option>one</option><option>three</option>');
    expect(cs.changes).toHaveLength(1);
    const c = cs.changes[0]!;
    expect(c.before).toBe('two');
    expect(c.after).toBe('three');
    expect(c.sourceXmlPath?.endsWith('/option[2]')).toBe(true);
  });

  it('duplicateFieldKeysAreNotDiscarded', () => {
    const b = '<fields><field><name>X</name><type>String</type></field>'
      + '<field><name>X</name><type>Integer</type></field></fields>';
    const cs = step('SelectValues', b, b.replaceAll('Integer', 'Number'));
    expect(cs.changes.length).toBeGreaterThan(0);
    expect(cs.changes.some((c) => c.sourceXmlPath?.includes('field[2]'))).toBe(true);
  });

  it('nestedPropertiesOfGenericKeyedFieldsAreCompared', () => {
    const b = '<fields><field><name>X</name><options><format>old</format></options></field></fields>';
    const cs = step('Unregistered', b, b.replaceAll('old', 'new'));
    expect(cs.changes.map((c) => c.property)).toEqual(['format']);
  });

  it('attributesOnKnownLeavesAndStepRootsAreDetected', () => {
    const b = K.step('A', 'TableInput', 0, 0, '<sql dialect="one">SELECT 1</sql>');
    const cs = compare(b, b.replaceAll('dialect="one"', 'dialect="two"').replaceAll('<step>', '<step plugin="custom">'));
    expect(sorted(cs.changes.map((c) => c.property))).toEqual(['@dialect', '@plugin']);
  });

  it('unknownExtensionsInsideAllSpecializedSectionsAreDetected', () => {
    const cases: [string, string][] = [
      ['SelectValues', '<fields><extension><value>old</value></extension></fields>'],
      ['FilterRows', '<compare><condition><extension>old</extension></condition></compare>'],
      ['ScriptValueMod', '<jsScripts><jsScript><jsScript_name>S</jsScript_name><extension>old</extension></jsScript></jsScripts>'],
      ['TableInput', '<sql><extension>old</extension></sql>'],
    ];
    for (const [type, body] of cases) {
      const cs = step(type, body, body.replaceAll('old', 'new'));
      expect(cs.changes.length, type).toBeGreaterThan(0);
      expect(cs.changes.some((c) => c.classification === 'unknown'), type).toBe(true);
    }
  });

  it('unknownInfoConnectionAndRootExtensionsAreDetected', () => {
    const b = '<transformation custom="old"><info><name>T</name><extension><value>old</value></extension></info>'
      + '<connection><name>DB</name><plugin><value>old</value></plugin></connection>'
      + '<extra>same</extra><extra>old</extra></transformation>';
    const cs = compareRaw(b, b.replaceAll('old', 'new'));
    expect(cs.changes).toHaveLength(4);
    expect(cs.changes.every((c) => c.kind === 'unknown_change')).toBe(true);
  });

  it('mixedContentWithEmptyChildrenIsNotEmpty', () => {
    expect(step('Unregistered', '<extra>old<empty/></extra>', '<extra>new<empty/></extra>').changes.length)
      .toBeGreaterThan(0);
  });

  it('movementDoesNotCoverUnrecognizedGuiProperties', () => {
    const before = K.dummyStep('A', 10, 20).replaceAll('</GUI>', '<extension>old</extension></GUI>');
    const cs = compare(before, before.replaceAll('<xloc>10', '<xloc>30').replaceAll('old', 'new'));
    expect(sorted(cs.changes.map((c) => c.kind))).toEqual(sorted(['step_moved', 'unknown_change']));
  });

  it('noteStyleAndHopExtensionsAreNotDiscarded', () => {
    const notes = K.notepads(K.notepad('hello', 1, 2))
      .replaceAll('</notepad>', '<plugin_style>old</plugin_style></notepad>');
    const body = K.order(K.hop('A', 'B').replaceAll('</hop>', '<extension>old</extension></hop>'))
      + K.dummyStep('A', 1, 2) + K.dummyStep('B', 3, 4);
    const before = K.transformationWithNotes('test', notes, body);
    const cs = compareRaw(before, before.replaceAll('old', 'new'));
    expect(sorted(cs.changes.map((c) => c.property))).toEqual(['extension', 'plugin_style']);
  });

  it('newGuiCoordinatesAndDrawFlagAreLayoutNotUnknown', () => {
    const noGui = '<step><name>A</name><type>Dummy</type></step>';
    const withGui = noGui.replaceAll('</step>', '<GUI><xloc>10</xloc><yloc>20</yloc><draw>Y</draw></GUI></step>');
    const cs = compare(noGui, withGui);
    expect(cs.changes).toHaveLength(2);
    expect(cs.changes.every((c) => c.classification === 'layout')).toBe(true);
  });

  it('semanticFieldExtensionsHoldingPasswordsAreRedacted', () => {
    const body = '<fields><meta><name>X</name><password>before-secret</password></meta></fields>';
    const cs = step('SelectValues', body, body.replaceAll('before-secret', 'after-secret'));
    expect(cs.changes).toHaveLength(1);
    const json = renderJson(cs, advancedConfig());
    expect(json).toContain('[REDACTED]');
    expect(json).not.toContain('before-secret');
    expect(json).not.toContain('after-secret');
  });

  it('newlyAddedKnownFieldIsNotDuplicatedByFallback', () => {
    const cs = step('SelectValues', '', '<fields><field><name>X</name><rename>Y</rename></field></fields>');
    expect(cs.changes.map((c) => c.kind)).toEqual(['field_added']);
  });

  it('semanticAndUnrecognizedChangesInSameSectionAreBothKept', () => {
    const b = '<fields><meta><name>X</name><length>10</length><extension><v>old</v></extension></meta></fields>';
    const cs = step('SelectValues', b, b.replaceAll('10', '20').replaceAll('old', 'new'));
    expect(sorted(cs.changes.map((c) => c.kind))).toEqual(sorted(['field_property_changed', 'unknown_change']));
  });

  it('selectedFieldOrderIsFunctionalButStepDocumentOrderIsNot', () => {
    const x = '<field><name>X</name></field>';
    const y = '<field><name>Y</name></field>';
    const cs = step('SelectValues', `<fields>${x}${y}</fields>`, `<fields>${y}${x}</fields>`);
    expect(cs.changes).toHaveLength(1);
    expect(cs.changes[0]!.property).toBe('field_order');
    expect(cs.changes[0]!.classification).toBe('functional');
    const a = K.dummyStep('A', 1, 2);
    const b = K.dummyStep('B', 3, 4);
    expect(compare(a + b, b + a).changes).toHaveLength(0);
  });

  it('whitespaceInsideSqlLiteralsIsFunctionalNotFormatting', () => {
    const cs = step('TableInput', "<sql>SELECT 'a b'</sql>", "<sql>SELECT 'ab'</sql>");
    expect(cs.changes).toHaveLength(1);
    expect(cs.changes[0]!.classification).toBe('functional');
  });

  it('secretsInUnknownSubtreesAndAttributesNeverReachReports', () => {
    const b = '<extension><password>before-secret</password><setting api_key="before-key">x</setting></extension>';
    const cs = step('Unregistered', b, b.replaceAll('before', 'after'));
    expect(cs.changes.length).toBeGreaterThan(0);
    for (const render of [renderJson, renderHtml, renderText]) {
      const report = render(cs, advancedConfig());
      expect(report).toContain('[REDACTED]');
      for (const secret of ['before-secret', 'after-secret', 'before-key', 'after-key']) {
        expect(report).not.toContain(secret);
      }
    }
  });

  it('generatedUnknownMutationsAreDetectedInBothDirectionsAndEveryMode', () => {
    // Java seeds java.util.Random(294031); the values only need to be varied and deterministic,
    // so a small LCG stands in for it.
    let seed = 294031;
    const next = (): number => {
      seed = (Math.imul(seed, 1103515245) + 12345) >>> 0;
      return seed;
    };
    for (let i = 0; i < 80; i++) {
      const tag = `plugin_${next() % 100000}`;
      const b = `<fields><field><name>F</name><${tag}><nested>${next() | 0}</nested></${tag}></field></fields>`;
      const a = b.replaceAll('</nested>', '_changed</nested>');
      for (const cs of [step('SelectValues', b, a), step('SelectValues', a, b)]) {
        expect(cs.changes.length, `mutation ${i}`).toBeGreaterThan(0);
        expect(applyMode(cs, defaultConfig()).visible.length).toBeGreaterThan(0);
        expect(applyMode(cs, advancedConfig()).hidden).toHaveLength(0);
      }
    }
  });
});
