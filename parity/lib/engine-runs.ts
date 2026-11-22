// Engine runs replaying the oracle recordings (parity/record.mjs), shared by the public parity
// tests and the opt-in private parity, so both compare exactly the same way.
import { readdirSync, readFileSync } from 'node:fs';
import { basename, join, relative } from 'node:path';
import {
  compareDirectories, compareDocuments, defaultConfig, renderDirectoryJson, renderHtml, renderJson, renderText,
} from '../../packages/core/src/index.ts';
import type { ChangeSet, DiffConfig, DirectoryResult, DocumentInput } from '../../packages/core/src/index.ts';
import { readExits, readReference, type ParityCase } from './cases.ts';
import { compareOutput, formatDifferences } from './compare.ts';

// The recorder runs `compare BEFORE AFTER --mode M --config <empty file>`: defaults with only the
// mode overridden, and inputs named after the file name (KtrInput.of(Path)).
export function pairInput(c: ParityCase, side: 'before' | 'after'): DocumentInput {
  const rel = side === 'before' ? c.before! : c.after!;
  return { name: basename(rel), content: new Uint8Array(readFileSync(join(c.dir, rel))) };
}

type Renderer = (cs: ChangeSet, config: DiffConfig) => string;
export type PairRun = readonly [output: string, mode: DiffConfig['mode'], render: Renderer];

export const JSON_RUNS: readonly PairRun[] = [
  ['advanced.json', 'advanced', renderJson], ['quick.json', 'quick', renderJson],
];
// The CLI prints the report with println, hence the trailing newline added to text and HTML.
const println = (r: Renderer): Renderer => (cs, config) => r(cs, config) + '\n';
export const TEXT_RUNS: readonly PairRun[] = [
  ['advanced.txt', 'advanced', println(renderText)], ['quick.txt', 'quick', println(renderText)],
  ['advanced.html', 'advanced', println(renderHtml)],
];

export const modeConfig = (mode: DiffConfig['mode']): DiffConfig => ({ ...defaultConfig(), mode });

/** One report per output that differs from the recording; values only when `showValues`. */
export function pairReports(c: ParityCase, runs: readonly PairRun[], showValues: boolean): string[] {
  const exits = readExits(c);
  const reports: string[] = [];
  for (const [output, mode, render] of runs) {
    const config = modeConfig(mode);
    const expected = readReference(c, output);
    // A run that printed nothing failed before rendering; nothing to compare for it.
    if (expected.trim() === '') throw new Error(`${output}: oracle printed nothing (exit ${exits[output]?.exit})`);
    const actual = render(compareDocuments(pairInput(c, 'before'), pairInput(c, 'after'), config), config);
    const diffs = compareOutput(output, expected, actual);
    if (diffs.length > 0) reports.push(formatDifferences(`${c.group}/${c.id}`, output, diffs, showValues));
  }
  return reports;
}

// The recorder runs `directory BEFORE AFTER --mode M --config <empty file>`; the CLI walks each
// folder and keys inputs by relative path. Unsupported files are passed too: the engine skips them.
export function folderInputs(root: string): DocumentInput[] {
  const inputs: DocumentInput[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (entry.isFile()) {
        inputs.push({ name: relative(root, path).replaceAll('\\', '/'), content: new Uint8Array(readFileSync(path)) });
      }
    }
  };
  walk(root);
  return inputs;
}

export function compareCaseFolders(c: ParityCase, config: DiffConfig): DirectoryResult {
  return compareDirectories(folderInputs(join(c.dir, c.before!)), folderInputs(join(c.dir, c.after!)), config);
}

export function directoryReports(c: ParityCase, showValues: boolean): string[] {
  const reports: string[] = [];
  for (const mode of ['advanced', 'quick'] as const) {
    const output = `directory.${mode}.json`;
    const config = modeConfig(mode);
    const diffs = compareOutput(output, readReference(c, output), renderDirectoryJson(compareCaseFolders(c, config), config));
    if (diffs.length > 0) reports.push(formatDifferences(`${c.group}/${c.id}`, output, diffs, showValues));
  }
  return reports;
}
