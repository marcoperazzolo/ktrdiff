import { describe, expect, it } from 'vitest';
import { parseTransformation } from '../src/index.ts';
import { configSimilarity, nameSimilarity } from '../src/match/similarity.ts';
import { DEFAULT_THRESHOLD, matchSteps } from '../src/match/step-matcher.ts';
import type { TransformationModel } from '../src/model/document.ts';
import { parseXmlString } from '../src/xml/secure-xml.ts';
import * as K from './support/ktrs.ts';

function parse(body: string): TransformationModel {
  return parseTransformation({ name: 't.ktr', content: K.transformation('t', body) });
}

// Ported from ktrdiff-core StepMatcherTest.
describe('StepMatcher (ported)', () => {
  it('sameNameMatchesRegardlessOfContent', () => {
    const b = parse(K.rowGenStep('Gen', 'A', 'String', '10', 0, 0));
    const a = parse(K.rowGenStep('Gen', 'A', 'Integer', '5', 0, 0));
    const r = matchSteps(b, a);
    expect(r.pairs).toHaveLength(1);
    expect(r.pairs[0]!.method).toBe('name');
    expect(r.addedSteps).toHaveLength(0);
    expect(r.removedSteps).toHaveLength(0);
  });

  it('exactRenameIsDetectedByFingerprint', () => {
    const b = parse(K.selectValuesStep('Old Name', 'String', '20', 100, 100));
    const a = parse(K.selectValuesStep('New Name', 'String', '20', 100, 100));
    const r = matchSteps(b, a);
    expect(r.pairs).toHaveLength(1);
    expect(r.pairs[0]!.method).toBe('fingerprint');
    expect(r.pairs[0]!.isRename()).toBe(true);
    expect(r.addedSteps).toHaveLength(0);
    expect(r.removedSteps).toHaveLength(0);
  });

  it('renameSurvivesAMoveBecauseLayoutIsExcludedFromFingerprints', () => {
    const b = parse(K.selectValuesStep('Old Name', 'String', '20', 100, 100));
    const a = parse(K.selectValuesStep('New Name', 'String', '20', 700, 400));
    const r = matchSteps(b, a);
    expect(r.pairs).toHaveLength(1);
    expect(r.pairs[0]!.method).toBe('fingerprint');
  });

  it('renameWithModificationMatchesBySimilarity', () => {
    const b = parse(K.selectValuesStep('Old Name', 'String', '20', 100, 100));
    const a = parse(K.selectValuesStep('New Name', 'String', '50', 100, 100));
    const r = matchSteps(b, a);
    expect(r.pairs).toHaveLength(1);
    expect(r.pairs[0]!.method).toBe('similarity');
    expect(r.pairs[0]!.score).toBeGreaterThanOrEqual(DEFAULT_THRESHOLD);
    expect(r.warnings).toHaveLength(0);
  });

  it('trulyDifferentStepStaysAddedAndRemoved', () => {
    const b = parse(K.tableInputStep('Read A', 'SELECT a FROM t1', 'DB', 0, 0));
    const a = parse(K.tableInputStep('Read B', 'SELECT completely, different FROM elsewhere WHERE x=9', 'OTHER_DB', 0, 0));
    const r = matchSteps(b, a);
    expect(r.pairs).toHaveLength(0);
    expect(r.removedSteps).toHaveLength(1);
    expect(r.addedSteps).toHaveLength(1);
  });

  it('identicalCandidatesWithoutTopologyStayAmbiguousRatherThanPairingAlphabetically', () => {
    const run = () => matchSteps(
      parse(K.dummyStep('One', 0, 0) + K.dummyStep('Two', 10, 0)),
      parse(K.dummyStep('Uno', 0, 0) + K.dummyStep('Due', 10, 0)));
    const r = run();
    expect(r.pairs).toHaveLength(0);
    expect(r.warnings.some((w) => w.code === 'ambiguous_step_match')).toBe(true);
    // deterministic: run again, same result
    const r2 = run();
    expect(r2.pairs).toHaveLength(0);
    expect(r2.warnings).toHaveLength(r.warnings.length);
    expect(r2.warnings).toEqual(r.warnings);
  });

  it('ambiguousSimilarityCandidatesProduceWarningAndNoRename', () => {
    const b = parse(K.selectValuesStep('Original', 'String', '20', 100, 100));
    const a = parse(K.selectValuesStep('Candidate A', 'String', '21', 100, 100)
      + K.selectValuesStep('Candidate B', 'String', '22', 100, 100));
    const r = matchSteps(b, a);
    expect(r.pairs).toHaveLength(0);
    expect(r.removedSteps).toHaveLength(1);
    expect(r.addedSteps).toHaveLength(2);
    expect(r.warnings.some((w) => w.code === 'ambiguous_step_match')).toBe(true);
  });

  it('fullyRenamedGraphWithSmallTweaksCascadesThroughIterativeRounds', () => {
    const b = parse(
      K.order(K.hop('Read Customers', 'Normalize Code'), K.hop('Normalize Code', 'Select Fields'))
      + K.tableInputStep('Read Customers',
        'SELECT customer_id, customer_code, customer_name FROM demo_customers WHERE active = 1', 'DEMO_DB', 100, 100)
      + K.scriptStep('Normalize Code', 'OUT = CODE.trim();', 220, 100)
      + K.selectValuesStep('Select Fields', 'String', '20', 340, 100));
    const a = parse(
      K.order(K.hop('ReadCustFromDb', 'NormalizeCustCode'), K.hop('NormalizeCustCode', 'SelCustFields'))
      + K.tableInputStep('ReadCustFromDb',
        'SELECT customer_id, customer_code, customer_name FROM demo_customers WHERE active = 1 AND deleted = 0',
        'DEMO_DB', 130, 140)
      + K.scriptStep('NormalizeCustCode', 'OUT = CODE.trim().toUpperCase();', 250, 140)
      + K.selectValuesStep('SelCustFields', 'String', '50', 370, 140));
    const r = matchSteps(b, a);
    expect(r.pairs).toHaveLength(3);
    expect(r.removedSteps).toHaveLength(0);
    expect(r.addedSteps).toHaveLength(0);
    expect(r.warnings).toHaveLength(0);
    const has = (bn: string, an: string) => r.pairs.some((p) => p.before.name === bn && p.after.name === an);
    expect(has('Read Customers', 'ReadCustFromDb')).toBe(true);
    expect(has('Normalize Code', 'NormalizeCustCode')).toBe(true);
    expect(has('Select Fields', 'SelCustFields')).toBe(true);
  });

  it('unmatchedStepsRecordTheirClosestNearMissCandidate', () => {
    // Synthetic names: a table read becomes a join with another table.
    const b = parse(K.tableInputStep('Requests',
      'SELECT r.RequestCode, r.OrderNumber FROM Requests r WHERE 1 = 1', 'LocalDb', 100, 100));
    const a = parse(K.tableInputStep('RequestsFromOrders',
      'SELECT DISTINCT r.OrderNumber FROM Orders o JOIN Requests r '
      + 'ON o.OrderRef = r.RequestCode WHERE o.SkipOnLoad = 0 '
      + "AND o.Ts >= 'x' AND r.Extra06 IS NOT NULL AND r.SkipOnLoad = 0",
      'LocalDb', 130, 100));
    const r = matchSteps(b, a);
    if (r.pairs.length === 0) {
      expect(r.decisions.some((d) => d.method === 'near-miss' && d.beforeStep === 'Requests'
        && d.afterStep === 'RequestsFromOrders' && d.score > 0.3)).toBe(true);
    } else {
      // acceptable alternative outcome if scoring evolves: an explicit unique match
      expect(r.pairs[0]!.method).toBe('similarity');
    }
  });

  it('logicalIdsAreSharedAcrossPairs', () => {
    const b = parse(K.selectValuesStep('Old', 'String', '20', 0, 0));
    const a = parse(K.selectValuesStep('New', 'String', '20', 0, 0));
    const r = matchSteps(b, a);
    expect(r.pairs[0]!.before.logicalId).not.toBeNull();
    expect(r.pairs[0]!.before.logicalId).toBe(r.pairs[0]!.after.logicalId);
  });
});

describe('match: TS-specific checks', () => {
  it('name similarity is bigram Dice on lowercased ASCII alphanumerics', () => {
    expect(nameSimilarity('Read A', 'read a')).toBe(1.0);
    expect(nameSimilarity('ab', 'cd')).toBe(0.0);
    expect(nameSimilarity('', 'x')).toBe(0.0);
    // {ab, bc} vs {ab, bd}: 2*1/4
    expect(nameSimilarity('abc', 'abd')).toBe(0.5);
  });

  it('config similarity blends text tokens and boilerplate 50/50', () => {
    const b = parseXmlString('<step><name>x</name><limit>0</limit><sql>SELECT a\nFROM t</sql></step>');
    const a = parseXmlString('<step><name>y</name><limit>0</limit><sql>SELECT b\nFROM t</sql></step>');
    // text tokens: {select, a, from, t} vs {select, b, from, t} -> 3/5; boilerplate 1/1.
    expect(configSimilarity(b, a)).toBe(0.5 * (3 / 5) + 0.5 * 1);
  });

  it('logical ids: pairs first, then removed, then added, in one sequence', () => {
    const r = matchSteps(parse(K.dummyStep('Keep', 0, 0) + K.tableInputStep('Gone', 'SELECT 1', 'DB', 0, 0)),
      parse(K.dummyStep('Keep', 0, 0) + K.selectValuesStep('New', 'String', '1', 0, 0)));
    expect(r.pairs.map((p) => p.before.logicalId)).toEqual(['L1']);
    expect(r.removedSteps.map((s) => s.logicalId)).toEqual(['B2']);
    expect(r.addedSteps.map((s) => s.logicalId)).toEqual(['A3']);
    expect(r.decisions.map((d) => d.method)).toEqual(['name', 'unmatched', 'unmatched']);
  });

  it('ambiguity detail uses %.3f scores and only the final round diagnostics are kept', () => {
    const r = matchSteps(
      parse(K.dummyStep('One', 0, 0) + K.dummyStep('Two', 10, 0)),
      parse(K.dummyStep('Uno', 0, 0) + K.dummyStep('Due', 10, 0)));
    const amb = r.decisions.filter((d) => d.method === 'ambiguous');
    expect(amb.length).toBeGreaterThan(0);
    expect(amb[0]!.detail).toMatch(/^best: \S+ -> \S+ \(\d\.\d{3}\); rivals:( \S+ -> \S+ \(\d\.\d{3}\);)+$/);
    expect(r.warnings).toHaveLength(amb.length);
  });
});
