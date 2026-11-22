// KtrDiffCli behaviour not exercised by the oracle recordings: configuration layers and their
// precedence, CLI overrides, --fail-on exit codes, --output, usage errors and the directory text
// report. Runs `main` in-process with a scratch cwd/home.
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { repoRoot } from '../../../parity/lib/cases.ts';
import { main } from '../src/main.ts';

const RENAMED = join(repoRoot, 'fixtures', 'steps', '004-step-renamed-and-modified');
const MOVED = join(repoRoot, 'fixtures', 'layout', '001-step-moved');
const SQL_WS = join(repoRoot, 'parity', 'probes', 'pairs', 'sql-whitespace-only');
const DIRS = join(repoRoot, 'parity', 'probes', 'directories', 'added-removed');

let cwd: string;
let home: string;

beforeEach(() => {
  cwd = mkdtempSync(join(tmpdir(), 'ktrdiff-cli-cwd-'));
  home = mkdtempSync(join(tmpdir(), 'ktrdiff-cli-home-'));
});
afterEach(() => {
  rmSync(cwd, { recursive: true, force: true });
  rmSync(home, { recursive: true, force: true });
});

function cli(...args: string[]): { exit: number; stdout: string; stderr: string } {
  let stdout = '';
  let stderr = '';
  const exit = main(args, { stdout: (t) => { stdout += t; }, stderr: (t) => { stderr += t; }, cwd, home });
  return { exit, stdout, stderr };
}

const pair = (dir: string): [string, string] =>
  [join(dir, 'before', 'canonical-flow.ktr'), join(dir, 'after', 'canonical-flow.ktr')];
const flatPair = (dir: string, ext = 'ktr'): [string, string] =>
  [join(dir, `before.${ext}`), join(dir, `after.${ext}`)];
const json = (stdout: string): { mode: string; changes: { classification: string }[] } => JSON.parse(stdout);

describe('configuration layers', () => {
  it('defaults to quick text without any configuration file', () => {
    const r = cli(...pair(RENAMED));
    expect(r.exit).toBe(0);
    expect(r.stdout.length).toBeGreaterThan(0);
    expect(json(cli(...pair(RENAMED), '--format', 'json').stdout).mode).toBe('quick');
  });

  it('applies ~/.ktrdiff.yml, then the repository file over it, then CLI arguments', () => {
    writeFileSync(join(home, '.ktrdiff.yml'), 'mode: advanced\n');
    expect(json(cli(...pair(RENAMED), '--format', 'json').stdout).mode).toBe('advanced');
    writeFileSync(join(cwd, '.ktrdiff.yml'), 'mode: custom\n');
    expect(json(cli(...pair(RENAMED), '--format', 'json').stdout).mode).toBe('custom');
    expect(json(cli(...pair(RENAMED), '--format', 'json', '--mode', 'quick').stdout).mode).toBe('quick');
  });

  it('--config replaces both file layers', () => {
    writeFileSync(join(home, '.ktrdiff.yml'), 'mode: advanced\n');
    writeFileSync(join(cwd, 'explicit.yml'), 'fail_on: any\n');
    const r = cli(...pair(RENAMED), '--format', 'json', '--config', 'explicit.yml');
    expect(json(r.stdout).mode).toBe('quick');
    expect(r.exit).toBe(1);
  });

  it('reads YAML 1.1 booleans like the SnakeYAML-based Java loader', () => {
    writeFileSync(join(cwd, '.ktrdiff.yml'), 'sql:\n  ignore_formatting: no\n');
    const strict = json(cli(...flatPair(SQL_WS), '--format', 'json', '--mode', 'advanced').stdout);
    expect(strict.changes.some((c) => c.classification === 'functional')).toBe(true);
  });

  it('reports unreadable or invalid configuration as exit 2', () => {
    expect(cli(...pair(RENAMED), '--config', 'missing.yml').exit).toBe(2);
    writeFileSync(join(cwd, 'bad.yml'), 'mode: sideways\n');
    const r = cli(...pair(RENAMED), '--config', 'bad.yml');
    expect(r.exit).toBe(2);
    expect(r.stderr).toMatch(/^ktrdiff: /);
  });
});

describe('CLI overrides', () => {
  it('--include-layout turns quick into custom with layout shown', () => {
    const r = json(cli(...pair(MOVED), '--format', 'json', '--include-layout').stdout);
    expect(r.mode).toBe('custom');
    expect(r.changes.some((c) => c.classification === 'layout')).toBe(true);
  });

  it('negatable options: the last occurrence wins', () => {
    const functional = (...flags: string[]): boolean => json(cli(...flatPair(SQL_WS), '--format', 'json',
      '--mode', 'advanced', ...flags).stdout).changes.some((c) => c.classification === 'functional');
    expect(functional()).toBe(false);
    expect(functional('--no-ignore-sql-formatting')).toBe(true);
    expect(functional('--no-ignore-sql-formatting', '--ignore-sql-formatting')).toBe(false);
  });
});

describe('exit codes and output', () => {
  it('--fail-on any|functional|unknown|none', () => {
    expect(cli(...pair(RENAMED), '--fail-on', 'any').exit).toBe(1);
    expect(cli(...pair(RENAMED), '--fail-on', 'none').exit).toBe(0);
    expect(cli(...pair(MOVED), '--fail-on', 'functional').exit).toBe(0);
    expect(cli(...pair(MOVED), '--fail-on', 'unknown').exit).toBe(0);
    const bad = cli(...pair(RENAMED), '--fail-on', 'Sometimes');
    expect(bad.exit).toBe(2);
    expect(bad.stderr).toBe('ktrdiff: unknown --fail-on value: sometimes\n');
  });

  it('missing files, unknown formats and wrong arity are exit 2', () => {
    expect(cli('compare', 'nope.ktr', pair(RENAMED)[1])).toMatchObject(
      { exit: 2, stderr: 'ktrdiff: file not found: nope.ktr\n' });
    expect(cli(...pair(RENAMED), '--format', 'pdf')).toMatchObject(
      { exit: 2, stderr: 'ktrdiff: Unknown format: pdf (use text, json or html)\n' });
    expect(cli('compare', pair(RENAMED)[0]).exit).toBe(2);
    expect(cli(pair(RENAMED)[0]).exit).toBe(2);
    expect(cli(...pair(RENAMED), '--no-such-option').exit).toBe(2);
    expect(cli('inspect', pair(RENAMED)[0], '--mode', 'advanced').exit).toBe(2);
  });

  it('--output writes the report and announces it on stderr', () => {
    const r = cli(...pair(RENAMED), '--format', 'json', '--output', 'report.json');
    expect(r).toMatchObject({ exit: 0, stdout: '', stderr: 'ktrdiff: report written to report.json\n' });
    expect(json(readFileSync(join(cwd, 'report.json'), 'utf8')).mode).toBe('quick');
  });

  it('--verbose prints timing and counts on stderr', () => {
    expect(cli(...pair(RENAMED), '--verbose').stderr)
      .toMatch(/^ktrdiff: compared canonical-flow\.ktr vs canonical-flow\.ktr in \d+ ms \(\d+ changes, \d+ warnings\)\n$/);
  });

  it('inspect and validate of an unreadable file are invalid_xml errors', () => {
    expect(cli('inspect', 'missing.ktr')).toMatchObject(
      { exit: 2, stderr: 'ktrdiff: [invalid_xml] Cannot read file: missing.ktr\n' });
    expect(cli('validate', 'missing.ktr')).toMatchObject(
      { exit: 2, stderr: 'INVALID [invalid_xml]: Cannot read file: missing.ktr\n' });
  });

  it('--version and --help', () => {
    expect(cli('--version').stdout).toMatch(/^ktrdiff \S+\n$/);
    expect(cli('--help')).toMatchObject({ exit: 0 });
  });
});

describe('directories', () => {
  it('compare on two folders delegates to directory; dir is an alias', () => {
    const before = join(DIRS, 'before');
    const after = join(DIRS, 'after');
    const viaCompare = cli('compare', before, after, '--format', 'json');
    expect(viaCompare.exit).toBe(0);
    expect(cli('dir', before, after, '--format', 'json').stdout).toBe(viaCompare.stdout);
  });

  it('renders the text report per file with status and paths', () => {
    const r = cli('directory', join(DIRS, 'before'), join(DIRS, 'after'));
    expect(r.exit).toBe(0);
    expect(r.stdout.startsWith('KTRDiff directory comparison\n')).toBe(true);
    expect(r.stdout).toMatch(/\nADDED {2}\S/);
    expect(r.stdout).toMatch(/\nREMOVED {2}\S/);
  });

  it('added/removed files fail --fail-on any; html and missing folders are exit 2', () => {
    expect(cli('directory', join(DIRS, 'before'), join(DIRS, 'after'), '--fail-on', 'any').exit).toBe(1);
    expect(cli('directory', join(DIRS, 'before'), join(DIRS, 'after'), '--format', 'html')).toMatchObject(
      { exit: 2, stderr: 'ktrdiff: Directory output supports text or json\n' });
    expect(cli('directory', 'nope', join(DIRS, 'after')).stderr).toBe('ktrdiff: Directory not found: nope\n');
  });

  it('skips unsupported files and walks subfolders in path order', () => {
    const b = join(cwd, 'b');
    const a = join(cwd, 'a');
    mkdirSync(join(b, 'sub'), { recursive: true });
    mkdirSync(join(a, 'sub'), { recursive: true });
    cpSync(pair(RENAMED)[0], join(b, 'sub', 'z.ktr'));
    cpSync(pair(RENAMED)[1], join(a, 'sub', 'z.ktr'));
    cpSync(pair(RENAMED)[0], join(b, 'a.ktr'));
    cpSync(pair(RENAMED)[0], join(a, 'a.ktr'));
    writeFileSync(join(a, 'notes.txt'), 'ignored');
    const r = JSON.parse(cli('directory', 'b', 'a', '--format', 'json').stdout) as
      { files: { beforePath: string; status: string }[] };
    expect(r.files.map((f) => [f.beforePath, f.status])).toEqual([['a.ktr', 'unchanged'], ['sub/z.ktr', 'modified']]);
  });
});
