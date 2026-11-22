// CLI parity with the v0.2.0 oracle: every recorded command (compare in both modes and three
// formats, directory, inspect, validate) re-run in-process through `main`, with the same
// arguments as parity/record.mjs. Stdout goes through the documented transforms of compareOutput,
// exit codes must be equal, stderr equal apart from the Xerces wording of invalid_xml (D1).
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { compareOutput, formatDifferences } from '../../../parity/lib/compare.ts';
import { publicCases, readExits, readReference, type ParityCase } from '../../../parity/lib/cases.ts';
import { main } from '../src/main.ts';

// An empty home and an explicit empty --config, as the recorder does: no ~/.ktrdiff.yml can leak.
const scratch = mkdtempSync(join(tmpdir(), 'ktrdiff-cli-parity-'));
const emptyConfig = join(scratch, 'empty-config.yml');
writeFileSync(emptyConfig, '');
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

interface Run { exit: number; stdout: string; stderr: string }

function cli(c: ParityCase, args: readonly string[]): Run {
  let stdout = '';
  let stderr = '';
  const exit = main(args, {
    stdout: (t) => { stdout += t; },
    stderr: (t) => { stderr += t; },
    cwd: c.dir,
    home: scratch,
  });
  return { exit, stdout, stderr };
}

const config = ['--config', emptyConfig];

function runsFor(c: ParityCase): [string, string[]][] {
  if (c.kind === 'pair') {
    return [
      ['advanced.json', ['compare', c.before!, c.after!, '--mode', 'advanced', '--format', 'json', ...config]],
      ['quick.json', ['compare', c.before!, c.after!, '--mode', 'quick', '--format', 'json', ...config]],
      ['advanced.txt', ['compare', c.before!, c.after!, '--mode', 'advanced', '--format', 'text', ...config]],
      ['quick.txt', ['compare', c.before!, c.after!, '--mode', 'quick', '--format', 'text', ...config]],
      ['advanced.html', ['compare', c.before!, c.after!, '--mode', 'advanced', '--format', 'html', ...config]],
      ['inspect.before.txt', ['inspect', c.before!]],
      ['inspect.after.txt', ['inspect', c.after!]],
    ];
  }
  if (c.kind === 'directory') {
    return [
      ['directory.advanced.json', ['directory', c.before!, c.after!, '--mode', 'advanced', '--format', 'json', ...config]],
      ['directory.quick.json', ['directory', c.before!, c.after!, '--mode', 'quick', '--format', 'json', ...config]],
    ];
  }
  return [['inspect.txt', ['inspect', c.doc!]], ['validate.txt', ['validate', c.doc!]]];
}

/** D1: the Xerces wording of XML errors is not reproduced on stderr either, only code and side. */
const withoutXmlMessage = (stderr: string): string =>
  stderr.replace(/\r\n/g, '\n').replace(/(\[invalid_xml\]:?) .*$/gm, '$1');

const cases = publicCases();

describe('cli parity (oracle v0.2.0)', () => {
  it('covers every recorded command', () => {
    const total = cases.reduce((n, c) => n + runsFor(c).length, 0);
    const recorded = cases.reduce((n, c) => n + Object.keys(readExits(c)).length, 0);
    expect(total).toBe(recorded);
  });

  for (const c of cases) {
    it(`${c.group}/${c.id} ${c.kind}`, () => {
      const exits = readExits(c);
      const problems: string[] = [];
      for (const [output, args] of runsFor(c)) {
        const recorded = exits[output]!;
        const actual = cli(c, args);
        if (actual.exit !== recorded.exit) problems.push(`${output}: exit ${actual.exit} != ${recorded.exit}`);
        if (withoutXmlMessage(actual.stderr) !== withoutXmlMessage(recorded.stderr)) {
          problems.push(`${output}: stderr ${JSON.stringify(actual.stderr)} != ${JSON.stringify(recorded.stderr)}`);
        }
        const diffs = compareOutput(output, readReference(c, output), actual.stdout);
        if (diffs.length > 0) problems.push(formatDifferences(`${c.group}/${c.id}`, output, diffs, true));
      }
      expect(problems, problems.join('\n')).toEqual([]);
    });
  }
});
