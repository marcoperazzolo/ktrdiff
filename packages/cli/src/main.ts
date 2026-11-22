// Entry point of the Node CLI (it.ktrdiff.cli.KtrDiffCli). Exit codes: 0 completed, 1 differences
// matched --fail-on, 2 input/parsing/configuration error, 3 unexpected internal error.
// `ktrdiff BEFORE AFTER` without a command behaves as `compare`. Help and argument-error wording
// is not the picocli one (intentional difference D4); exit codes are.

import { realpathSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { runCompare } from './commands/compare.ts';
import { runDirectory } from './commands/directory.ts';
import { parseGitInstallArgs, runGit, runGitDiff, runGitInstall } from './commands/git.ts';
import { parseFixturesArgs, runFixturesCommand } from './commands/fixtures.ts';
import { runInspect } from './commands/inspect.ts';
import { parseCompareArgs, parseFileArgs } from './commands/options.ts';
import { runValidate } from './commands/validate.ts';
import { CliError, nodeIo, type CliIo } from './io.ts';
// Inlined by the bundler, so the single-file CLI needs no package.json next to it.
import cliPackage from '../package.json' with { type: 'json' };

export const VERSION: string = cliPackage.version;

const COMPARE_OPTIONS_HELP = `Options:
  --mode MODE                  quick | advanced | custom (default: quick)
  --format FORMAT              text | json | html (default: text)
  --output FILE                write the report to a file instead of stdout
  --config FILE                explicit .ktrdiff.yml configuration file
  --ignore-layout              hide layout changes (quick behaviour)
  --include-layout             show layout changes in custom mode
  --[no-]ignore-sql-formatting     whitespace-only SQL changes are non-functional (default: true)
  --[no-]ignore-script-whitespace  whitespace-only script changes are non-functional (default: false)
  --show-xml-paths             include XML paths in the output
  --show-raw                   include raw diffs in the output
  --fail-on VALUE              any | functional | unknown: exit 1 when matched
  --pentaho-version VERSION    declared PDI version of the inputs (e.g. 9.4.0.0-343)
  --verbose                    print progress details to stderr
  --color WHEN                 auto | always | never: colours in text reports (default: auto,
                               only on a terminal; NO_COLOR disables them)
  -h, --help                   show this help
`;

const USAGE = `Usage: ktrdiff [OPTIONS] BEFORE AFTER
       ktrdiff COMMAND [ARGS]
Compare Pentaho Data Integration .ktr, .kjb and .kdb documents: steps, fields, queries and hops.

Commands:
  compare BEFORE AFTER         compare two documents (same as without a command)
  directory|dir BEFORE AFTER   recursively compare two directories
  inspect FILE                 show the structure of one .ktr file
  validate FILE                check that a file is a parseable KTR document
  fixtures [--dir D] [--known-issues F] [--id ID]   run the golden fixture suite
  git OLD NEW [-- PATH]        compare two files or two Git revisions of PATH (git difftool)
  git-diff PATH OLD-FILE OLD-HEX OLD-MODE NEW-FILE NEW-HEX NEW-MODE   Git external diff driver
  git-install [--apply-repo]   print (or apply to the current repository) the Git configuration

${COMPARE_OPTIONS_HELP}  -V, --version                print the version
`;

const usageError = (message: string): CliError => new CliError(message);

function exactly(positionals: readonly string[], count: number, labels: string): void {
  if (positionals.length !== count) {
    throw usageError(`expected ${labels}, got ${positionals.length} argument(s)`);
  }
}

function run(argv: readonly string[], io: CliIo): number {
  const [command, ...rest] = argv;
  switch (command) {
    case 'compare':
    case 'directory':
    case 'dir': {
      const parsed = parseCompareArgs(rest);
      if (parsed.help) { io.stdout(USAGE); return 0; }
      exactly(parsed.positionals, 2, 'BEFORE AFTER');
      const [before, after] = parsed.positionals as [string, string];
      return command === 'compare'
        ? runCompare(before, after, parsed.options, io)
        : runDirectory(before, after, parsed.options, io);
    }
    case 'inspect':
    case 'validate': {
      const parsed = parseFileArgs(rest);
      if (parsed.help) { io.stdout(USAGE); return 0; }
      exactly(parsed.positionals, 1, 'FILE');
      const file = parsed.positionals[0]!;
      return command === 'inspect' ? runInspect(file, io) : runValidate(file, io);
    }
    case 'git':
    case 'git-diff': {
      const parsed = parseCompareArgs(rest);
      if (parsed.help) { io.stdout(USAGE); return 0; }
      if (command === 'git-diff') {
        exactly(parsed.positionals, 7, 'PATH OLD-FILE OLD-HEX OLD-MODE NEW-FILE NEW-HEX NEW-MODE');
        return runGitDiff(parsed.positionals, parsed.options, io);
      }
      if (parsed.positionals.length < 2) throw usageError('expected OLD NEW [-- PATH]');
      const [oldRef, newRef, ...paths] = parsed.positionals as [string, string, ...string[]];
      return runGit(oldRef, newRef, paths, parsed.options, io);
    }
    case 'git-install': {
      const parsed = parseGitInstallArgs(rest);
      if (parsed.help) { io.stdout(USAGE); return 0; }
      return runGitInstall(parsed, io);
    }
    case 'fixtures': {
      const parsed = parseFixturesArgs(rest);
      if (parsed.help) { io.stdout(USAGE); return 0; }
      return runFixturesCommand(parsed, io);
    }
    default: {
      const parsed = parseCompareArgs(argv);
      if (parsed.help) { io.stdout(USAGE); return 0; }
      if (parsed.version) { io.stdout(`ktrdiff ${VERSION}\n`); return 0; }
      if (parsed.positionals.length !== 2) { io.stderr(USAGE); return 2; }
      const [before, after] = parsed.positionals as [string, string];
      return runCompare(before, after, parsed.options, io);
    }
  }
}

/** Runs one CLI invocation and returns its exit code; never calls process.exit. */
export function main(argv: readonly string[], io: CliIo = nodeIo()): number {
  try {
    return run(argv, io);
  } catch (e) {
    if (e instanceof CliError) {
      io.stderr('ktrdiff: ' + e.message + '\n');
      return 2;
    }
    io.stderr('Internal error: ' + (e instanceof Error ? e.message : String(e)) + '\n');
    return 3;
  }
}

function isEntryPoint(): boolean {
  const script = process.argv[1];
  if (script === undefined) return false;
  try {
    return import.meta.url === pathToFileURL(realpathSync(script)).href;
  } catch {
    return false;
  }
}

if (isEntryPoint()) process.exitCode = main(process.argv.slice(2));
