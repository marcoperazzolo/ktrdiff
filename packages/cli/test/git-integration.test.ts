// Port of GitIntegrationTest: the git-diff seven-argument contract, difftool with empty sides and
// real Git revisions plus the installed diff driver in a temporary repository.
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { build } from 'esbuild';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { repoRoot } from '../../../parity/lib/cases.ts';
import { selfCommand } from '../src/commands/git.ts';
import { main } from '../src/main.ts';

const KTR = '<transformation><info/><step><name>A</name><type>Dummy</type></step></transformation>';
const hasGit = spawnSync('git', ['--version'], { windowsHide: true }).status === 0;
if (!hasGit) console.warn('git not found on PATH: skipping the real-repository Git integration test');

let temp: string;
beforeEach(() => { temp = mkdtempSync(join(tmpdir(), 'ktrdiff git-')); });
afterEach(() => { rmSync(temp, { recursive: true, force: true }); });

function cli(io: { script?: string }, ...args: string[]): { exit: number; stdout: string; stderr: string } {
  let stdout = '';
  let stderr = '';
  const exit = main(args, {
    stdout: (t) => { stdout += t; }, stderr: (t) => { stderr += t; }, cwd: temp, home: null, ...io,
  });
  return { exit, stdout, stderr };
}

function git(...args: string[]): string {
  return execFileSync('git', args, { cwd: temp, encoding: 'utf8', windowsHide: true });
}

describe('GitIntegrationTest', () => {
  it('externalDriverUsesGitSevenArgumentOrder', () => {
    const old = join(temp, 'old file.ktr');
    const current = join(temp, 'new file.ktr');
    const report = join(temp, 'report.json');
    writeFileSync(old, KTR);
    writeFileSync(current, KTR.replace('<name>A', '<name>B'));
    const r = cli({}, 'git-diff', 'path with spaces.ktr', old, 'abc', '100644', current, 'def', '100644',
      '--format', 'json', '--output', report);
    expect(r.exit).toBe(0);
    const json = readFileSync(report, 'utf8');
    expect(json).toContain('step_renamed');
    expect(json).not.toContain('step_added');
    expect(json).not.toContain('step_removed');
  });

  it('gitDifftoolSupportsEmptyFilesForAdditionAndRemoval', () => {
    const empty = join(temp, 'empty.ktr');
    const full = join(temp, 'full.ktr');
    const report = join(temp, 'report.json');
    writeFileSync(empty, '');
    writeFileSync(full, KTR);
    for (const added of [true, false]) {
      const r = cli({}, 'git', added ? empty : full, added ? full : empty, '--format', 'json', '--output', report);
      expect(r.exit).toBe(0);
      const json = readFileSync(report, 'utf8');
      expect(json).toContain(added ? 'step_added' : 'step_removed');
      expect(json).not.toContain('invalid_xml');
    }
  });

  it('externalDriverDoesNotReadMissingSideAndRetainsFailOn', () => {
    const full = join(temp, 'full.ktr');
    const report = join(temp, 'report.json');
    writeFileSync(full, KTR);
    const r = cli({}, 'git-diff', 'file.ktr', 'nonexistent', '0', '000000', full, 'abc', '100644',
      '--fail-on', 'functional', '--format', 'json', '--output', report);
    expect(r.exit).toBe(1);
    expect(readFileSync(report, 'utf8')).toContain('step_added');
  });

  it.skipIf(!hasGit)('realGitRevisionsAndExternalDriverWorkWithSpacesAndMissingPaths', async () => {
    const commit = (...args: string[]): string =>
      git('-c', 'user.name=KTRDiff Test', '-c', 'user.email=test@example.invalid', 'commit', '--quiet', ...args);
    git('init', '--quiet');
    commit('--allow-empty', '-m', 'empty');
    writeFileSync(join(temp, 'example file.ktr'), KTR);
    writeFileSync(join(temp, '.gitattributes'), '*.ktr diff=ktrdiff\n');
    git('add', '.');
    commit('-m', 'add KTR');

    const added = cli({}, 'git', 'HEAD~1', 'HEAD', '--format', 'json', '--', 'example file.ktr');
    expect(added.exit, added.stderr).toBe(0);
    expect(added.stdout).toContain('step_added');
    expect(added.stdout).not.toContain('invalid_xml');
    const removed = cli({}, 'git', 'HEAD', 'HEAD~1', '--format', 'json', '--', 'example file.ktr');
    expect(removed.exit, removed.stderr).toBe(0);
    expect(removed.stdout).toContain('step_removed');
    expect(cli({}, 'git', 'no-such-rev', 'HEAD', '--', 'example file.ktr').exit).toBe(2);

    // Git spawns the driver itself, so it needs a runnable single file: bundle the CLI into the
    // scratch folder (the H4 bundle does the same) and let git-install write the config.
    const script = join(temp, 'bundle dir', 'ktrdiff.mjs');
    await build({
      entryPoints: [join(repoRoot, 'packages', 'cli', 'src', 'main.ts')], outfile: script,
      bundle: true, platform: 'node', target: 'node22', format: 'esm', logLevel: 'silent',
      // yaml's CommonJS build requires node builtins, which an ESM bundle only gets through this.
      banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" },
    });
    const install = cli({ script }, 'git-install', '--apply-repo');
    expect(install.exit, install.stderr).toBe(0);
    expect(git('config', 'diff.ktrdiff.command')).toBe(selfCommand(script) + ' git-diff\n');

    writeFileSync(join(temp, 'example file.ktr'), KTR.replace('<name>A', '<name>Renamed'));
    const diff = git('diff', '--', 'example file.ktr');
    expect(diff).toContain('Renamed');
    expect(diff).not.toContain('invalid_xml');
    expect(diff).not.toContain('\u001b[');
    // Behind Git's pager (GIT_PAGER_IN_USE, inherited by the driver) the report is coloured.
    const { NO_COLOR: _ignored, ...env } = process.env;
    const paged = execFileSync('git', ['diff', '--', 'example file.ktr'],
      { cwd: temp, encoding: 'utf8', windowsHide: true, env: { ...env, GIT_PAGER_IN_USE: 'true' } });
    expect(paged).toContain('\u001b[1;94mSTEP RENAMED');
  }, 60_000);
});

describe('git-install', () => {
  it('prints the configuration without touching any repository', () => {
    const r = cli({ script: join(temp, 'it\'s', 'ktrdiff.mjs') }, 'git-install');
    expect(r.exit).toBe(0);
    expect(r.stdout).toContain('*.kjb diff=ktrdiff');
    expect(r.stdout).toContain('Nothing was changed.');
    // The printed lines stay pasteable even when the path holds a single quote.
    expect(r.stdout).toMatch(/git config diff\.ktrdiff\.command 'node ".*it'\\''s\/ktrdiff\.mjs" git-diff'/);
  });

  it('falls back to ktrdiff when the script path is unknown', () => {
    expect(selfCommand(undefined)).toBe('ktrdiff');
    // sh double-quote specials are escaped; Windows backslashes become slashes.
    expect(selfCommand('/a "b"/$x.mjs')).toMatch(/^node "(?:[A-Za-z]:)?\/a \\"b\\"\/\\\$x\.mjs"$/);
  });
});
