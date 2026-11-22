#!/usr/bin/env node
// Records the outputs of the v0.2.0 oracle jar (see build-oracle.mjs) for every parity case.
//
//   node parity/record.mjs            fixtures/ + parity/probes/ -> parity/reference/ (committed)
//   node parity/record.mjs --private  private-fixtures/ -> private-fixtures/.parity/ (never committed)
//
// Case kinds: a pair of single documents, a pair of directories, or a single document. Every
// command runs with the case directory as cwd and relative paths, so no absolute path of this
// machine reaches the outputs, and with an explicit empty --config so ~/.ktrdiff.yml or a
// repository .ktrdiff.yml can never influence the reference. Outputs are deterministic: running
// this twice must leave `git diff parity/reference` clean.
import { spawnSync, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const TAG = 'v0.2.0';
const SUPPORTED = /\.(ktr|kjb|kdb)$/i;
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const jar = join(repoRoot, '.oracle', `ktrdiff-${TAG}.jar`);
const emptyConfig = join(repoRoot, '.oracle', 'empty-config.yml');
const isPrivate = process.argv.includes('--private');

// Java picks the console code page for stdout on Windows when not told otherwise; force UTF-8 so
// non-ASCII names and the em dash of `validate` are recorded as the engine produced them.
const JAVA_OPTS = ['-Dfile.encoding=UTF-8', '-Dstdout.encoding=UTF-8', '-Dstderr.encoding=UTF-8',
  '-Dpicocli.ansi=false'];

if (!existsSync(jar)) {
  console.error(`record: oracle jar missing (${jar}); run "npm run oracle:build" first`);
  process.exit(2);
}
mkdirSync(dirname(emptyConfig), { recursive: true });
writeFileSync(emptyConfig, '');

const unixNewlines = (text) => text.replace(/\r\n?/g, '\n');

function java(args, cwd) {
  const result = spawnSync('java', [...JAVA_OPTS, '-jar', jar, ...args], { cwd, encoding: 'utf8' });
  if (result.error) throw result.error;
  return { exit: result.status, stdout: unixNewlines(result.stdout), stderr: unixNewlines(result.stderr) };
}

const isDir = (p) => existsSync(p) && statSync(p).isDirectory();
const sortedEntries = (dir) => readdirSync(dir).sort();

/** The single supported document inside `dir`, for the fixture layout before/<seed>.ktr. */
function singleDocument(dir) {
  const docs = sortedEntries(dir).filter((name) => SUPPORTED.test(name) && !isDir(join(dir, name)));
  if (docs.length !== 1) throw new Error(`expected one document in ${dir}, found ${docs.length}`);
  return docs[0];
}

/** before.*|after.* files of a flat pair (fixture legacy layout, probes, private cases). */
function flatFile(dir, side) {
  return sortedEntries(dir).find((name) => name.startsWith(`${side}.`) && SUPPORTED.test(name)
    && !isDir(join(dir, name)));
}

/**
 * Classifies a case directory. `beforeDirIsPair` distinguishes the fixture layout, where
 * before/ holds exactly one document of a single-file pair, from probes and private cases,
 * where before/ and after/ are whole directories to compare.
 */
function classify(caseDir, beforeDirIsPair) {
  const before = flatFile(caseDir, 'before');
  const after = flatFile(caseDir, 'after');
  if (before && after) return { kind: 'pair', before, after };
  if (isDir(join(caseDir, 'before')) && isDir(join(caseDir, 'after'))) {
    if (beforeDirIsPair) {
      return {
        kind: 'pair',
        before: `before/${singleDocument(join(caseDir, 'before'))}`,
        after: `after/${singleDocument(join(caseDir, 'after'))}`,
      };
    }
    return { kind: 'directory', before: 'before', after: 'after' };
  }
  const doc = sortedEntries(caseDir).find((name) => /^doc\./.test(name) && SUPPORTED.test(name));
  if (doc) return { kind: 'single', doc };
  return null;
}

/** Case directories below `root` (any depth, e.g. pdi-<version>/<category>/<case>/). */
function findCases(root, beforeDirIsPair) {
  const cases = [];
  const walk = (dir) => {
    for (const name of sortedEntries(dir)) {
      const child = join(dir, name);
      if (!isDir(child) || name.startsWith('.')) continue;
      const kind = classify(child, beforeDirIsPair);
      if (kind) cases.push({ dir: child, ...kind });
      else walk(child);
    }
  };
  if (isDir(root)) walk(root);
  return cases;
}

const COMPARE_RUNS = [
  ['advanced.json', ['--mode', 'advanced', '--format', 'json']],
  ['quick.json', ['--mode', 'quick', '--format', 'json']],
  ['advanced.txt', ['--mode', 'advanced', '--format', 'text']],
  ['quick.txt', ['--mode', 'quick', '--format', 'text']],
  ['advanced.html', ['--mode', 'advanced', '--format', 'html']],
];

function record(c, outDir) {
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });
  const exits = {};
  const save = (name, result) => {
    writeFileSync(join(outDir, name), result.stdout);
    exits[name] = { exit: result.exit, stderr: result.stderr };
  };
  const config = ['--config', relative(c.dir, emptyConfig).replace(/\\/g, '/')];
  if (c.kind === 'pair') {
    for (const [name, opts] of COMPARE_RUNS) {
      save(name, java(['compare', c.before, c.after, ...opts, ...config], c.dir));
    }
    save('inspect.before.txt', java(['inspect', c.before], c.dir));
    save('inspect.after.txt', java(['inspect', c.after], c.dir));
  } else if (c.kind === 'directory') {
    save('directory.advanced.json', java(['directory', c.before, c.after, '--mode', 'advanced',
      '--format', 'json', ...config], c.dir));
    save('directory.quick.json', java(['directory', c.before, c.after, '--mode', 'quick',
      '--format', 'json', ...config], c.dir));
  } else {
    save('inspect.txt', java(['inspect', c.doc], c.dir));
    save('validate.txt', java(['validate', c.doc], c.dir));
  }
  writeFileSync(join(outDir, 'exit.json'), `${JSON.stringify(exits, null, 2)}\n`);
}

function recordAll(sourceRoot, outRoot, beforeDirIsPair) {
  const cases = findCases(sourceRoot, beforeDirIsPair);
  rmSync(outRoot, { recursive: true, force: true });
  for (const c of cases) {
    const rel = relative(sourceRoot, c.dir).replace(/\\/g, '/');
    record(c, join(outRoot, rel));
    console.log(`recorded ${c.kind.padEnd(9)} ${rel}`);
  }
  return cases.length;
}

function writeOracleMd(referenceDir) {
  const sha256 = createHash('sha256').update(readFileSync(jar)).digest('hex');
  const commit = execFileSync('git', ['rev-parse', `${TAG}^{commit}`], { cwd: repoRoot, encoding: 'utf8' }).trim();
  const javaVersion = unixNewlines(spawnSync('java', ['-version'], { encoding: 'utf8' }).stderr).trim();
  const body = [
    `| Tag | \`${TAG}\` |`,
    `| Commit | \`${commit}\` |`,
    `| Jar | \`.oracle/ktrdiff-${TAG}.jar\` (built by \`npm run oracle:build\`) |`,
    `| Jar SHA-256 | \`${sha256}\` |`,
    '',
    '`java -version`:',
    '',
    '```text',
    javaVersion,
    '```',
  ].join('\n');
  const file = join(referenceDir, 'ORACLE.md');
  // Keep the recording date unless the oracle itself changed, so re-recording stays a no-op.
  const previous = existsSync(file) ? unixNewlines(readFileSync(file, 'utf8')) : '';
  const previousDate = /^\| Recorded \| (\S+) \|$/m.exec(previous)?.[1];
  const date = previous.includes(body) && previousDate ? previousDate : new Date().toISOString().slice(0, 10);
  writeFileSync(file, [
    '# Parity oracle',
    '',
    'Outputs under this directory were produced by the Java CLI built from the tag below, via',
    '`npm run oracle:record`. Do not edit them by hand.',
    '',
    '| Field | Value |',
    '|---|---|',
    `| Recorded | ${date} |`,
    body,
    '',
  ].join('\n'));
}

if (isPrivate) {
  const privateRoot = join(repoRoot, 'private-fixtures');
  const outRoot = join(privateRoot, '.parity');
  const count = recordAll(privateRoot, outRoot, false);
  // Never print case contents; the count is enough.
  console.log(`private cases recorded: ${count} (in ${relative(repoRoot, outRoot)})`);
} else {
  const referenceDir = join(repoRoot, 'parity', 'reference');
  mkdirSync(referenceDir, { recursive: true });
  const fixtures = recordAll(join(repoRoot, 'fixtures'), join(referenceDir, 'fixtures'), true);
  const probes = recordAll(join(repoRoot, 'parity', 'probes'), join(referenceDir, 'probes'), false);
  const report = java(['fixtures', '--dir', 'fixtures', '--known-issues', 'fixtures-known-issues.yml'], repoRoot);
  writeFileSync(join(referenceDir, 'fixtures-report.txt'), report.stdout);
  writeFileSync(join(referenceDir, 'fixtures-report.exit.json'),
    `${JSON.stringify({ exit: report.exit, stderr: report.stderr }, null, 2)}\n`);
  writeOracleMd(referenceDir);
  console.log(`fixture cases: ${fixtures}, probe cases: ${probes}`);
}
