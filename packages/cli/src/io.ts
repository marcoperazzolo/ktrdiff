// Process boundary of the CLI: commands write through an injectable CliIo so tests can run them
// in-process, with their own working directory and home (no ~/.ktrdiff.yml leaking into tests).

import { homedir } from 'node:os';
import { resolve } from 'node:path';

export interface CliIo {
  stdout(text: string): void;
  stderr(text: string): void;
  /** Base for relative paths and for the repository `.ktrdiff.yml`. */
  cwd: string;
  /** Directory of the user `.ktrdiff.yml`; null disables it. */
  home: string | null;
  /** Absolute path of the running CLI script, used by git-install; unknown in in-process runs. */
  script?: string;
  /** stdout is a terminal that accepts ANSI colours (`--color auto`); unset in tests. */
  colorTerminal?: boolean;
}

export function nodeIo(): CliIo {
  return {
    stdout: (text) => { process.stdout.write(text); },
    stderr: (text) => { process.stderr.write(text); },
    cwd: process.cwd(),
    home: homedir(),
    ...(process.argv[1] !== undefined ? { script: resolve(process.argv[1]) } : {}),
    colorTerminal: colorTerminal(),
  };
}

/**
 * Whether `--color auto` colours stdout: a terminal, or Git's pager when Git runs the CLI as its
 * diff driver (Git exports GIT_PAGER_IN_USE, the same signal its own color.ui=auto uses).
 * A non-empty NO_COLOR (https://no-color.org) or TERM=dumb disables colours.
 */
export function colorTerminal(env: NodeJS.ProcessEnv = process.env, isTTY = process.stdout.isTTY === true): boolean {
  if (env.NO_COLOR || env.TERM === 'dumb') return false;
  return isTTY || env.GIT_PAGER_IN_USE === 'true';
}

/**
 * A user-facing failure (Java IOException / IllegalArgumentException caught by the commands):
 * printed as `ktrdiff: <message>` with exit code 2. Anything else is an internal error (exit 3).
 */
export class CliError extends Error {}

/** Node file-system errors (ENOENT, EACCES…) are input errors, like Java IOException. */
export function isFsError(e: unknown): e is Error {
  return e instanceof Error && typeof (e as NodeJS.ErrnoException).code === 'string'
    && (e as NodeJS.ErrnoException).syscall !== undefined;
}
