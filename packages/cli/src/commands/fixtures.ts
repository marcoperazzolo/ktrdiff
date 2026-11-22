// KtrDiffCli.FixturesCommand: runs the golden fixture suite and prints one line per fixture.
// Exit 1 when a fixture fails, 2 when nothing matched.

import { parseArgs } from 'node:util';
import { resolve } from 'node:path';
import { runFixtures } from '../fixtures/runner.ts';
import { CliError, type CliIo } from '../io.ts';
import { javaTrim } from '../java.ts';

const STATUS_TEXT = {
  PASS: 'PASS',
  KNOWN_ISSUE: 'KNOWN-ISSUE',
  KNOWN_ISSUE_PASSING: 'KNOWN-ISSUE (passing! consider lifting quarantine)',
  FAIL: 'FAIL',
  LOAD_ERROR: 'FAIL',
} as const;

export interface FixturesArgs {
  dir: string;
  knownIssues: string;
  id: string | null;
  help: boolean;
}

export function parseFixturesArgs(args: readonly string[]): FixturesArgs {
  try {
    const { values, positionals } = parseArgs({
      args: [...args],
      options: {
        'dir': { type: 'string' },
        'known-issues': { type: 'string' },
        'id': { type: 'string' },
        'help': { type: 'boolean', short: 'h' },
      },
      allowPositionals: true,
      strict: true,
    });
    if (positionals.length > 0) throw new CliError('unexpected argument: ' + positionals[0]);
    return {
      dir: values.dir ?? 'fixtures',
      knownIssues: values['known-issues'] ?? 'fixtures-known-issues.yml',
      id: values.id ?? null,
      help: values.help === true,
    };
  } catch (e) {
    if (e instanceof CliError) throw e;
    throw new CliError(e instanceof Error ? e.message : String(e));
  }
}

export function runFixturesCommand(args: FixturesArgs, io: CliIo): number {
  const results = runFixtures(resolve(io.cwd, args.dir), resolve(io.cwd, args.knownIssues), args.id);
  if (results.length === 0) {
    io.stderr('ktrdiff: no fixtures found under ' + args.dir + (args.id !== null ? " matching '" + args.id + "'" : '')
      + '\n');
    return 2;
  }
  let pass = 0;
  let fail = 0;
  let known = 0;
  let out = '';
  for (const r of results) {
    if (r.status === 'PASS') pass++;
    else if (r.status === 'KNOWN_ISSUE' || r.status === 'KNOWN_ISSUE_PASSING') known++;
    else fail++;
    out += r.label.padEnd(55, ' ') + ' ' + ('[' + r.id + ']').padEnd(12, ' ') + ' ' + STATUS_TEXT[r.status] + '\n';
    if (r.status === 'FAIL' || r.status === 'LOAD_ERROR') {
      for (const p of r.problems) out += '      ' + p.replaceAll('\n', '\n      ') + '\n';
    }
    if (r.knownIssueReason !== null && r.knownIssueReason.length > 0) {
      out += '      reason: ' + javaTrim(r.knownIssueReason) + '\n';
    }
  }
  out += `\nFixtures: ${pass} passed, ${fail} failed, ${known} known-issue, ${results.length} total\n`;
  io.stdout(out);
  return fail > 0 ? 1 : 0;
}
