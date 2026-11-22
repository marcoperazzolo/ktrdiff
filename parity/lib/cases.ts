// Discovery of parity cases and access to their recorded oracle outputs (Node only: reads files).
// The case classification mirrors parity/record.mjs; keep the two in sync, because a case the
// recorder sees differently from the tests would silently lose its reference.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export type CaseGroup = 'fixtures' | 'probes' | 'private';
export type CaseKind = 'pair' | 'directory' | 'single';

export interface ParityCase {
  group: CaseGroup;
  /** Path of the case relative to its group root, with forward slashes. */
  id: string;
  kind: CaseKind;
  /** Absolute directory holding the inputs; the oracle ran with it as cwd. */
  dir: string;
  /** Input paths relative to `dir` (pair and directory kinds). */
  before?: string;
  after?: string;
  /** Input path relative to `dir` (single kind). */
  doc?: string;
  /** Absolute directory with the recorded outputs (may be missing for private cases). */
  referenceDir: string;
}

export interface RecordedExit {
  exit: number | null;
  stderr: string;
}

export const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

const SUPPORTED = /\.(ktr|kjb|kdb)$/i;
const isDir = (p: string): boolean => existsSync(p) && statSync(p).isDirectory();
const sortedEntries = (dir: string): string[] => readdirSync(dir).sort();

function singleDocument(dir: string): string {
  const docs = sortedEntries(dir).filter((name) => SUPPORTED.test(name) && !isDir(join(dir, name)));
  if (docs.length !== 1) throw new Error(`expected one document in ${dir}, found ${docs.length}`);
  return docs[0]!;
}

function flatFile(dir: string, side: 'before' | 'after'): string | undefined {
  return sortedEntries(dir).find((name) => name.startsWith(`${side}.`) && SUPPORTED.test(name)
    && !isDir(join(dir, name)));
}

type Classified = Pick<ParityCase, 'kind' | 'before' | 'after' | 'doc'>;

function classify(caseDir: string, beforeDirIsPair: boolean): Classified | null {
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

function findCases(group: CaseGroup, sourceRoot: string, referenceRoot: string,
  beforeDirIsPair: boolean): ParityCase[] {
  const cases: ParityCase[] = [];
  const walk = (dir: string): void => {
    for (const name of sortedEntries(dir)) {
      const child = join(dir, name);
      if (!isDir(child) || name.startsWith('.')) continue;
      const kind = classify(child, beforeDirIsPair);
      if (kind) {
        const id = relative(sourceRoot, child).replace(/\\/g, '/');
        cases.push({ group, id, dir: child, referenceDir: join(referenceRoot, id), ...kind });
      } else {
        walk(child);
      }
    }
  };
  if (isDir(sourceRoot)) walk(sourceRoot);
  return cases;
}

/** Committed fixtures and probes, with references under parity/reference/. */
export function publicCases(root: string = repoRoot): ParityCase[] {
  const reference = join(root, 'parity', 'reference');
  return [
    ...findCases('fixtures', join(root, 'fixtures'), join(reference, 'fixtures'), true),
    ...findCases('probes', join(root, 'parity', 'probes'), join(reference, 'probes'), false),
  ];
}

/** The owner's local cases; only those already recorded by `oracle:record:private`. */
export function privateCases(root: string = repoRoot): ParityCase[] {
  const source = join(root, 'private-fixtures');
  return findCases('private', source, join(source, '.parity'), false)
    .filter((c) => existsSync(join(c.referenceDir, 'exit.json')));
}

/** Output files recorded for each kind of case (exit.json aside). */
export const RECORDED_OUTPUTS: Readonly<Record<CaseKind, readonly string[]>> = {
  pair: ['advanced.json', 'quick.json', 'advanced.txt', 'quick.txt', 'advanced.html',
    'inspect.before.txt', 'inspect.after.txt'],
  directory: ['directory.advanced.json', 'directory.quick.json'],
  single: ['inspect.txt', 'validate.txt'],
};

/** Recorded stdout of one output, with `\n` line ends (as the recorder wrote it). */
export function readReference(c: ParityCase, output: string): string {
  return readFileSync(join(c.referenceDir, output), 'utf8');
}

export function readExits(c: ParityCase): Record<string, RecordedExit> {
  return JSON.parse(readReference(c, 'exit.json')) as Record<string, RecordedExit>;
}
