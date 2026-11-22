// Colours of the text reports: only on a terminal (or --color always), only for text on stdout,
// and removing the escape codes gives back exactly the uncoloured report.
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { repoRoot } from '../../../parity/lib/cases.ts';
import { colorizeReport } from '../src/color.ts';
import { colorTerminal } from '../src/io.ts';
import { main } from '../src/main.ts';

const RENAMED = join(repoRoot, 'fixtures', 'steps', '004-step-renamed-and-modified');
const BEFORE = join(RENAMED, 'before', 'canonical-flow.ktr');
const AFTER = join(RENAMED, 'after', 'canonical-flow.ktr');
const DIRS = join(repoRoot, 'parity', 'probes', 'directories', 'added-removed');
const ANSI = /\u001b\[[0-9;]*m/g;
const strip = (s: string): string => s.replace(ANSI, '');

let cwd: string;
beforeEach(() => { cwd = mkdtempSync(join(tmpdir(), 'ktrdiff-color-')); });
afterEach(() => { rmSync(cwd, { recursive: true, force: true }); });

function cli(colorTerminal: boolean | undefined, ...args: string[]): { exit: number; stdout: string; stderr: string } {
  let stdout = '';
  let stderr = '';
  const exit = main(args, {
    stdout: (t) => { stdout += t; }, stderr: (t) => { stderr += t; }, cwd, home: null,
    ...(colorTerminal === undefined ? {} : { colorTerminal }),
  });
  return { exit, stdout, stderr };
}

describe('colorizeReport', () => {
  it('colours headings by action and diff lines by side', () => {
    const text = ['STEP ADDED', '  A [Dummy]', 'STEP REMOVED', 'STEP RENAMED', '  - Old', '  + New  [Dummy]',
      'MODIFIED STEP', 'HOP TARGET CHANGED', 'NOTE MOVED', 'NOTE CHANGED (text)', 'UNKNOWN CHANGES', 'ERRORS',
      'TRANSFORMATION PROPERTIES', '    renamed to: X', '  -> To', ''].join('\n');
    const lines = colorizeReport(text).split('\n');
    expect(lines[0]).toBe('\u001b[1;32mSTEP ADDED\u001b[0m');
    expect(lines[1]).toBe('  A [Dummy]');
    expect(lines[2]).toBe('\u001b[1;31mSTEP REMOVED\u001b[0m');
    expect(lines[3]).toBe('\u001b[1;94mSTEP RENAMED\u001b[0m');
    expect(lines[4]).toBe('  \u001b[31m- Old\u001b[0m');
    expect(lines[5]).toBe('  \u001b[32m+ New  [Dummy]\u001b[0m');
    expect(lines[6]).toBe('\u001b[1;33mMODIFIED STEP\u001b[0m');
    expect(lines[7]).toBe('\u001b[1;33mHOP TARGET CHANGED\u001b[0m');
    expect(lines[8]).toBe('\u001b[1;36mNOTE MOVED\u001b[0m');
    expect(lines[9]).toBe('\u001b[1;33mNOTE CHANGED (text)\u001b[0m');
    expect(lines[10]).toBe('\u001b[1;35mUNKNOWN CHANGES\u001b[0m');
    expect(lines[11]).toBe('\u001b[1;31mERRORS\u001b[0m');
    expect(lines[12]).toBe('\u001b[1mTRANSFORMATION PROPERTIES\u001b[0m');
    expect(lines[13]).toBe('    \u001b[94mrenamed to: X\u001b[0m');
    expect(lines[14]).toBe('  -> To');
    expect(strip(colorizeReport(text))).toBe(text);
  });

  it('colours the file status of the directory report', () => {
    expect(colorizeReport('ADDED  a.ktr')).toBe('\u001b[1;32mADDED\u001b[0m\u001b[1m  a.ktr\u001b[0m');
    expect(colorizeReport('RENAMED  a.ktr -> b.ktr')).toContain('\u001b[1;94mRENAMED');
  });
});

describe('colorTerminal', () => {
  it('accepts a TTY or the Git pager, and honours NO_COLOR and TERM=dumb', () => {
    expect(colorTerminal({}, true)).toBe(true);
    expect(colorTerminal({}, false)).toBe(false);
    expect(colorTerminal({ GIT_PAGER_IN_USE: 'true' }, false)).toBe(true);
    expect(colorTerminal({ NO_COLOR: '1' }, true)).toBe(false);
    expect(colorTerminal({ NO_COLOR: '' }, true)).toBe(true);
    expect(colorTerminal({ TERM: 'dumb', GIT_PAGER_IN_USE: 'true' }, true)).toBe(false);
  });
});

describe('--color', () => {
  it('auto colours a terminal only, and the colours strip back to the plain report', () => {
    const plain = cli(undefined, BEFORE, AFTER, '--mode', 'advanced');
    const terminal = cli(true, BEFORE, AFTER, '--mode', 'advanced');
    expect(plain.stdout).not.toMatch(ANSI);
    expect(terminal.stdout).toMatch(ANSI);
    expect(strip(terminal.stdout)).toBe(plain.stdout);
    expect(cli(false, BEFORE, AFTER).stdout).not.toMatch(ANSI);
  });

  it('always and never override the terminal detection', () => {
    expect(cli(false, BEFORE, AFTER, '--color', 'always').stdout).toMatch(ANSI);
    expect(cli(true, BEFORE, AFTER, '--color', 'never').stdout).not.toMatch(ANSI);
  });

  it('never colours JSON, HTML or a report written to a file', () => {
    expect(cli(true, BEFORE, AFTER, '--format', 'json', '--color', 'always').stdout).not.toMatch(ANSI);
    expect(cli(true, BEFORE, AFTER, '--format', 'html', '--color', 'always').stdout).not.toMatch(ANSI);
    const r = cli(true, BEFORE, AFTER, '--color', 'always', '--output', 'report.txt');
    expect(r.exit).toBe(0);
    expect(readFileSync(join(cwd, 'report.txt'), 'utf8')).not.toMatch(ANSI);
  });

  it('colours the directory text report', () => {
    const r = cli(true, 'directory', join(DIRS, 'before'), join(DIRS, 'after'));
    expect(r.exit).toBe(0);
    expect(r.stdout).toContain('\u001b[1;32mADDED');
    expect(r.stdout).toContain('\u001b[1;31mREMOVED');
  });

  it('rejects an unknown value', () => {
    const r = cli(true, BEFORE, AFTER, '--color', 'sometimes');
    expect(r.exit).toBe(2);
    expect(r.stderr).toContain('--color');
  });
});
