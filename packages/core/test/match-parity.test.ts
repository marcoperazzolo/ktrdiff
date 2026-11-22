// Matcher-level parity: the oracle's `matchingDecisions` in advanced.json come straight from
// StepMatcher, so they can be checked before the engine exists (F3). Exact score equality.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { publicCases, readReference } from '../../../parity/lib/cases.ts';
import { parseDocument } from '../src/index.ts';
import { matchSteps } from '../src/match/step-matcher.ts';

interface RecordedJson { errors?: unknown[]; matchingDecisions?: unknown[] }

const cases = publicCases().filter((c) => c.kind === 'pair').flatMap((c) => {
  let json: RecordedJson;
  try {
    json = JSON.parse(readReference(c, 'advanced.json')) as RecordedJson;
  } catch {
    return [];
  }
  if ((json.errors?.length ?? 0) > 0 || json.matchingDecisions === undefined) return [];
  return [{ c, expected: json.matchingDecisions }];
});

describe('matcher parity with the oracle matchingDecisions', () => {
  it('has cases', () => {
    expect(cases.length).toBeGreaterThan(10);
  });
  for (const { c, expected } of cases) {
    it(`${c.group}/${c.id}`, () => {
      const read = (p: string) => parseDocument({ name: p, content: new Uint8Array(readFileSync(join(c.dir, p))) });
      const r = matchSteps(read(c.before!), read(c.after!));
      const actual = r.decisions.map((d) => ({
        before: d.beforeStep, after: d.afterStep, method: d.method, score: d.score, detail: d.detail,
      }));
      expect(actual).toEqual(expected);
    });
  }
});
