// Per-file change summary (step G2) on committed fixtures. Reads files through Node, so it is
// type-checked by parity/tsconfig.json like the parity tests.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { repoRoot } from '../../../parity/lib/cases.ts';
import { applyMode, compareDocuments, defaultConfig, summarizeChanges } from '../src/index.ts';
import type { ChangeSummary } from '../src/index.ts';

const fixturesRoot = join(repoRoot, 'fixtures');
const zero = { added: 0, removed: 0, renamed: 0, modified: 0 };

function fixtureSummary(id: string, mode: 'advanced' | 'quick'): ChangeSummary {
  const dir = join(fixturesRoot, id);
  const doc = (side: string) => {
    const name = readdirSync(join(dir, side)).find((n: string) => /\.(ktr|kjb|kdb)$/i.test(n))!;
    return { name, content: new Uint8Array(readFileSync(join(dir, side, name))) };
  };
  const config = { ...defaultConfig(), mode };
  return summarizeChanges(applyMode(compareDocuments(doc('before'), doc('after'), config), config).visible);
}

describe('summarizeChanges: fixtures', () => {
  it('steps/003 is one renamed step and no hop change', () => {
    const s = fixtureSummary('steps/003-step-renamed', 'advanced');
    expect(s.steps).toEqual({ ...zero, renamed: 1 });
    expect(s.hops).toEqual(zero);
  });

  it('steps/004 is one renamed step even though it was also modified', () => {
    expect(fixtureSummary('steps/004-step-renamed-and-modified', 'advanced').steps).toEqual({ ...zero, renamed: 1 });
  });

  it('hops/001 changes hops only', () => {
    const s = fixtureSummary('hops/001-target-changed', 'advanced');
    expect(s.steps).toEqual(zero);
    expect(s.hops).toEqual({ ...zero, added: 1, removed: 1 });
  });

  it('layout/001 summarizes to zero in quick mode while the advanced summary is not empty', () => {
    const quick = fixtureSummary('layout/001-step-moved', 'quick');
    expect(quick).toEqual({ steps: zero, hops: zero, notes: zero, connections: zero, document: 0, other: 0, total: 0 });
    expect(fixtureSummary('layout/001-step-moved', 'advanced').total).toBeGreaterThan(0);
  });
});
