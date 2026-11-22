// KtrDiffCli git, git-diff and git-install: Git integration as local commands. Git is only ever
// run through execFileSync with an argument array (never a shell), in the CLI working directory.

import { execFileSync } from 'node:child_process';
import { statSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { resolve } from 'node:path';
import { compareDocuments, DirectoryDiffEngine, type ChangeSet, type DocumentInput } from '@ktrdiff/core';
import { isRegularFile, readDocument } from '../fs-input.ts';
import { CliError, isFsError, type CliIo } from '../io.ts';
import { report } from './compare.ts';
import { buildConfig, type CompareOptions } from './options.ts';

const ABSENT = '(absent)';
/** Same cap as the default maxFileBytes; the engine still applies the configured limit. */
const MAX_GIT_OUTPUT = 64 * 1024 * 1024;

/** emptyGitInput: a missing side is an empty transformation, never an XML error. */
const emptyGitInput = (): DocumentInput =>
  ({ name: ABSENT, content: new TextEncoder().encode('<transformation><info/></transformation>') });

/** gitInput: /dev/null and empty files (git difftool for additions/removals) are absent sides. */
function gitInput(path: string, io: CliIo): DocumentInput {
  if (path.replaceAll('\\', '/') === '/dev/null') return emptyGitInput();
  const absolute = resolve(io.cwd, path);
  return statSync(absolute).size === 0 ? emptyGitInput() : readDocument(absolute);
}

/** `git OLD NEW [-- PATH]`: OLD/NEW are existing files or Git revisions of the last PATH. */
export function runGit(oldRef: string, newRef: string, paths: readonly string[], options: CompareOptions,
  io: CliIo): number {
  return guarded(io, () => {
    const resolveInput = (ref: string): DocumentInput => {
      if (ref === '/dev/null') return emptyGitInput();
      if (isRegularFile(resolve(io.cwd, ref))) return gitInput(ref, io);
      if (paths.length === 0) {
        throw new CliError(`'${ref}' is not a file; to compare revisions pass the file: `
          + `ktrdiff git ${oldRef} ${newRef} -- path/to/file.ktr`);
      }
      const relPath = paths[paths.length - 1]!;
      if (ref.startsWith('-')) throw new CliError('Invalid Git revision');
      // Validate the revision first: a bad ref is an error, a missing path is an empty side.
      if (git(io, ['rev-parse', '--verify', '--end-of-options', ref + '^{tree}']) === null) {
        throw new CliError('Invalid Git revision: ' + ref);
      }
      const entries = git(io, ['--literal-pathspecs', 'ls-tree', '--name-only', '-z', ref, '--', relPath]);
      if (entries === null) throw new CliError('Cannot read Git tree: ' + ref);
      if (entries.length === 0) return emptyGitInput();
      const content = git(io, ['show', '--end-of-options', ref + ':' + relPath], true);
      if (content === null) throw new CliError(`git show ${ref}:${relPath} failed`);
      return { name: ref + ':' + relPath, content };
    };
    return compareGit(resolveInput(oldRef), resolveInput(newRef), options, io);
  });
}

/** Git external diff protocol: path old-file old-hash old-mode new-file new-hash new-mode. */
export function runGitDiff(args: readonly string[], options: CompareOptions, io: CliIo): number {
  const [, oldFile, , oldMode, newFile, , newMode] = args as [string, string, string, string, string, string, string];
  return guarded(io, () => compareGit(
    oldMode === '000000' ? emptyGitInput() : gitInput(oldFile, io),
    newMode === '000000' ? emptyGitInput() : gitInput(newFile, io), options, io));
}

function compareGit(before: DocumentInput, after: DocumentInput, options: CompareOptions, io: CliIo): number {
  const config = buildConfig(options, io);
  let changes: ChangeSet;
  if (before.name === ABSENT && after.name !== ABSENT) changes = new DirectoryDiffEngine().presence(after, true, config);
  else if (after.name === ABSENT && before.name !== ABSENT) changes = new DirectoryDiffEngine().presence(before, false, config);
  else {
    const versioned = (input: DocumentInput): DocumentInput =>
      options.pentahoVersion === undefined ? input : { ...input, pentahoVersion: options.pentahoVersion };
    changes = compareDocuments(versioned(before), versioned(after), config);
  }
  return report(changes, config, options, io);
}

function guarded(io: CliIo, body: () => number): number {
  try {
    return body();
  } catch (e) {
    if (e instanceof CliError || isFsError(e)) {
      io.stderr('ktrdiff: ' + e.message + '\n');
      return 2;
    }
    throw e;
  }
}

/** Runs git; returns stdout, or null on a non-zero exit. A missing git binary is a user error. */
function git(io: CliIo, args: readonly string[], forwardStderr = false): Uint8Array | null {
  try {
    return new Uint8Array(execFileSync('git', args, {
      cwd: io.cwd, maxBuffer: MAX_GIT_OUTPUT, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
    }));
  } catch (e) {
    const err = e as NodeJS.ErrnoException & { status?: number | null; stderr?: Buffer };
    if (err.code === 'ENOENT') throw new CliError('git not found on PATH');
    if (forwardStderr && err.stderr !== undefined && err.stderr.length > 0) io.stderr(err.stderr.toString('utf8'));
    if (typeof err.status === 'number') return null;
    throw e;
  }
}

// ----------------------------------------------------------------------------------- git-install

export interface GitInstallArgs {
  applyRepo: boolean;
  help: boolean;
}

export function parseGitInstallArgs(args: readonly string[]): GitInstallArgs {
  try {
    const { values } = parseArgs({
      args: [...args], strict: true, allowPositionals: false,
      options: { 'apply-repo': { type: 'boolean' }, 'help': { type: 'boolean', short: 'h' } },
    });
    return { applyRepo: values['apply-repo'] === true, help: values.help === true };
  } catch (e) {
    throw new CliError(e instanceof Error ? e.message : String(e));
  }
}

/** POSIX single quoting, so the printed `git config` lines can be pasted into any sh. */
const shQuote = (s: string): string => "'" + s.replaceAll("'", "'\\''") + "'";

/**
 * The command Git runs through its sh: `node "<absolute script path>"` (D6; Java printed
 * `ktrdiff`), falling back to `ktrdiff` when the script path is unknown. Forward slashes keep
 * Windows paths valid for Git's sh, and double quotes keep spaces.
 */
export function selfCommand(script: string | undefined): string {
  if (script === undefined) return 'ktrdiff';
  const path = resolve(script).replaceAll('\\', '/').replace(/[\\"$`]/g, (c) => '\\' + c);
  return `node "${path}"`;
}

export function runGitInstall(args: GitInstallArgs, io: CliIo): number {
  const self = selfCommand(io.script);
  const diffCmd = self + ' git-diff';
  const difftoolCmd = self + ' git "$LOCAL" "$REMOTE"';
  io.stdout([
    'KTRDiff Git integration',
    '=======================',
    '',
    '1. Add to .gitattributes (marks .ktr files for the ktrdiff diff driver):',
    '',
    '   *.ktr diff=ktrdiff',
    '   *.kjb diff=ktrdiff',
    '   *.kdb diff=ktrdiff',
    '',
    '2. Configure the difftool and diff driver (repository-local):',
    '',
    '   git config diff.ktrdiff.command ' + shQuote(diffCmd),
    '   git config difftool.ktrdiff.cmd ' + shQuote(difftoolCmd),
    '',
    '3. Use it:',
    '',
    '   git difftool -t ktrdiff -- path/to/transformation.ktr',
    '   ktrdiff git HEAD~1 HEAD -- path/to/transformation.ktr',
    '',
    '',
  ].join('\n'));
  if (!args.applyRepo) {
    io.stdout('Nothing was changed. Re-run with --apply-repo to apply the two\n'
      + '`git config` lines to the current repository (never global).\n');
    return 0;
  }
  const a = gitConfig(io, 'diff.ktrdiff.command', diffCmd);
  const b = gitConfig(io, 'difftool.ktrdiff.cmd', difftoolCmd);
  if (!a || !b) {
    io.stderr('ktrdiff: could not apply git config (are you inside a repository?)\n');
    return 2;
  }
  io.stdout("Applied to the current repository. Remember to add '*.ktr diff=ktrdiff'\n"
    + 'to .gitattributes yourself (ktrdiff never edits your files).\n');
  return 0;
}

function gitConfig(io: CliIo, key: string, value: string): boolean {
  try {
    return git(io, ['config', key, value], true) !== null;
  } catch (e) {
    if (e instanceof CliError) return false;
    throw e;
  }
}
