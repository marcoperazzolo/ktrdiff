// Engine parity with the v0.2.0 oracle on committed fixtures and probes: JSON since F3c, text and
// HTML since F4, directory pairs since G1. The runs live in parity/lib/engine-runs.ts, shared with
// the private parity.
import { describe, expect, it } from 'vitest';
import { publicCases, readExits, RECORDED_OUTPUTS } from '../../../parity/lib/cases.ts';
import { directoryReports, JSON_RUNS, pairReports, TEXT_RUNS } from '../../../parity/lib/engine-runs.ts';

const cases = publicCases();

describe('parity references', () => {
  it('has the 14 fixture cases and the probes recorded', () => {
    expect(cases.filter((c) => c.group === 'fixtures')).toHaveLength(14);
    expect(cases.filter((c) => c.group === 'probes').length).toBeGreaterThan(0);
  });

  it('has an exit code for every recorded output', () => {
    for (const c of cases) {
      expect(Object.keys(readExits(c)).sort(), `${c.group}/${c.id}`).toEqual([...RECORDED_OUTPUTS[c.kind]].sort());
    }
  });
});

describe('engine parity: JSON', () => {
  for (const c of cases.filter((x) => x.kind === 'pair')) {
    it(`${c.group}/${c.id}`, () => {
      const reports = pairReports(c, JSON_RUNS, true);
      expect(reports, reports.join('\n')).toEqual([]);
    });
  }
});

describe('engine parity: text and HTML', () => {
  for (const c of cases.filter((x) => x.kind === 'pair')) {
    it(`${c.group}/${c.id}`, () => {
      const reports = pairReports(c, TEXT_RUNS, true);
      expect(reports, reports.join('\n')).toEqual([]);
    });
  }
});

describe('engine parity: directories', () => {
  for (const c of cases.filter((x) => x.kind === 'directory')) {
    it(`${c.group}/${c.id}`, () => {
      const reports = directoryReports(c, true);
      expect(reports, reports.join('\n')).toEqual([]);
    });
  }
});
