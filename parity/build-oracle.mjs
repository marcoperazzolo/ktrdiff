#!/usr/bin/env node
// Builds the parity oracle: the v0.2.0 Java CLI jar, compiled from the tag (never from the working
// tree) in a detached git worktree under .oracle/ (gitignored). The jar is the reference the
// TypeScript engine must match; see docs/plans/01-typescript-engine.md "Parity harness".
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const TAG = 'v0.2.0';
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const oracleDir = join(repoRoot, '.oracle');
const worktree = join(oracleDir, TAG);
const jarOut = join(oracleDir, `ktrdiff-${TAG}.jar`);
const isWindows = process.platform === 'win32';

function run(cmd, args, cwd) {
  // Argument arrays only: no shell interpolation of paths. mvnw.cmd needs a shell on Windows
  // (batch files cannot be spawned directly since the CVE-2024-27980 fix), so it is the only
  // case where shell is enabled, with fixed arguments.
  execFileSync(cmd, args, { cwd, stdio: 'inherit', shell: isWindows && cmd.endsWith('.cmd') });
}

if (!existsSync(worktree)) {
  // The public repository has no Java history: the tag lives in the owner's private archive.
  try { execFileSync('git', ['rev-parse', '--verify', '--quiet', `refs/tags/${TAG}`], { cwd: repoRoot }); } catch {
    console.error(`build-oracle: tag ${TAG} not found. The Java oracle is kept in a private archive repository;`
      + ' fetch the tag from it to rebuild the jar. The recorded references in parity/reference need no oracle.');
    process.exit(1);
  }
  run('git', ['worktree', 'add', '--detach', worktree, TAG], repoRoot);
}

const mvnw = isWindows ? join(worktree, 'mvnw.cmd') : join(worktree, 'mvnw');
run(mvnw, ['-q', '-pl', 'ktrdiff-cli', '-am', 'package', '-DskipTests'], worktree);

const targetDir = join(worktree, 'ktrdiff-cli', 'target');
const jars = readdirSync(targetDir).filter((name) => name.endsWith('-all.jar'));
if (jars.length !== 1) {
  throw new Error(`expected exactly one *-all.jar in ${targetDir}, found: ${jars.join(', ') || 'none'}`);
}
copyFileSync(join(targetDir, jars[0]), jarOut);

const sha256 = createHash('sha256').update(readFileSync(jarOut)).digest('hex');
console.log(`oracle jar: ${jarOut}`);
console.log(`sha256: ${sha256}`);
