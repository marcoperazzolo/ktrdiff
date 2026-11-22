// Port of GoldenFixturesTest: every fixture under fixtures/ runs in Advanced mode against its
// expected.yml with the quarantine of fixtures-known-issues.yml. Also checks that the `fixtures`
// command prints exactly the oracle report (parity/reference/fixtures-report.txt).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { repoRoot } from '../../../parity/lib/cases.ts';
import { runFixtures } from '../src/fixtures/runner.ts';
import { main } from '../src/main.ts';

const results = runFixtures(join(repoRoot, 'fixtures'), join(repoRoot, 'fixtures-known-issues.yml'), null);

describe('golden fixtures', () => {
  it('goldenFixtures: discovers the fixtures with the same quarantine as the jar', () => {
    expect(results.length).toBeGreaterThan(0);
    expect(results.filter((r) => r.status === 'PASS')).toHaveLength(13);
    expect(results.filter((r) => r.status === 'KNOWN_ISSUE').map((r) => r.label)).toEqual(['steps/001-step-added']);
  });

  it.each(results.map((r) => [`${r.label} [${r.id}] -> ${r.status}`, r] as const))('goldenFixtures: %s', (_title, r) => {
    if (r.status === 'FAIL' || r.status === 'LOAD_ERROR') {
      expect.fail(`Fixture ${r.label} failed:\n  ${r.problems.join('\n  ')}`);
    }
  });

  it('fixtures command output equals the oracle report', () => {
    let stdout = '';
    let stderr = '';
    const exit = main(['fixtures', '--dir', 'fixtures', '--known-issues', 'fixtures-known-issues.yml'], {
      stdout: (t) => { stdout += t; }, stderr: (t) => { stderr += t; }, cwd: repoRoot, home: null,
    });
    const recorded = JSON.parse(readFileSync(join(repoRoot, 'parity', 'reference', 'fixtures-report.exit.json'), 'utf8'));
    expect({ exit, stderr }).toEqual({ exit: recorded.exit, stderr: recorded.stderr });
    expect(stdout).toBe(readFileSync(join(repoRoot, 'parity', 'reference', 'fixtures-report.txt'), 'utf8'));
  });

  it('fixtures --id filters by id or label, and reports an empty selection as exit 2', () => {
    const run = (...args: string[]): { exit: number; stdout: string; stderr: string } => {
      let stdout = '';
      let stderr = '';
      const exit = main(['fixtures', ...args], { stdout: (t) => { stdout += t; }, stderr: (t) => { stderr += t; }, cwd: repoRoot, home: null });
      return { exit, stdout, stderr };
    };
    expect(run('--id', 'steps-004').stdout).toContain('1 total');
    expect(run('--id', 'steps/').stdout).toContain('4 total');
    expect(run('--id', 'nope')).toMatchObject({ exit: 2, stderr: "ktrdiff: no fixtures found under fixtures matching 'nope'\n" });
  });
});
