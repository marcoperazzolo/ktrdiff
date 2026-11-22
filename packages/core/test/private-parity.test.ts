// Opt-in parity on the owner's local documents (project `private-parity`, `npm run
// parity:private`). Failure messages name case folders and JSON paths only, never document
// content. After the run, private-fixtures/.parity/report.md (untracked) puts each case's note
// next to the TypeScript result, so the owner can check it against what they described.
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { privateCases, repoRoot, type ParityCase } from '../../../parity/lib/cases.ts';
import {
  compareCaseFolders, directoryReports, folderInputs, JSON_RUNS, modeConfig, pairInput, pairReports, TEXT_RUNS,
} from '../../../parity/lib/engine-runs.ts';
import { compareDocuments, summarizeChanges } from '../src/index.ts';
import type { ChangeSet, ChangeSummary, DocumentInput } from '../src/index.ts';

const root = join(repoRoot, 'private-fixtures');
const cases = privateCases();

interface FileRow {
  before: string | null;
  after: string | null;
  status: string;
  method: string;
  changeSet: ChangeSet;
  ms: number | null;
}

interface CaseRecord {
  parity: string[];
  files: FileRow[];
  failure?: string;
}

const records = new Map<string, CaseRecord>();

/** Time of one advanced comparison, the slowest-file figure of the aggregates. */
function timed(before: DocumentInput, after: DocumentInput): { changeSet: ChangeSet; ms: number } {
  const start = performance.now();
  const changeSet = compareDocuments(before, after, modeConfig('advanced'));
  return { changeSet, ms: performance.now() - start };
}

function tsResult(c: ParityCase): FileRow[] {
  if (c.kind === 'pair') {
    const r = timed(pairInput(c, 'before'), pairInput(c, 'after'));
    return [{ before: c.before!, after: c.after!, status: 'pair', method: '-', ...r }];
  }
  const result = compareCaseFolders(c, modeConfig('advanced'));
  const byName = (side: string): Map<string, DocumentInput> =>
    new Map(folderInputs(join(c.dir, side)).map((i) => [i.name, i]));
  const before = byName(c.before!);
  const after = byName(c.after!);
  return result.files.map((f) => {
    const b = f.beforePath === null ? undefined : before.get(f.beforePath);
    const a = f.afterPath === null ? undefined : after.get(f.afterPath);
    return {
      before: f.beforePath, after: f.afterPath, status: f.status, method: f.method, changeSet: f.changeSet,
      ms: b && a ? timed(b, a).ms : null,
    };
  });
}

describe('private parity', () => {
  if (cases.length === 0) {
    it.skip('no private oracle outputs (run npm run oracle:record:private first)', () => {});
  }
  for (const c of cases) {
    it(`${c.id} (${c.kind})`, () => {
      const record: CaseRecord = { parity: [], files: [] };
      records.set(c.id, record);
      try {
        record.files = tsResult(c);
      } catch (e) {
        record.failure = e instanceof Error ? e.message : String(e);
      }
      if (c.kind === 'single') {
        // inspect/validate are CLI outputs, compared by the CLI parity on public cases only.
        return;
      }
      record.parity = c.kind === 'pair'
        ? [...pairReports(c, JSON_RUNS, false), ...pairReports(c, TEXT_RUNS, false)]
        : directoryReports(c, false);
      expect(record.parity, record.parity.join('\n')).toEqual([]);
    });
  }
});

// ----------------------------------------------------------------------------- local report

/** The case's note.md or, failing that, free-text notes (.md/.txt) of its enclosing group folders. */
function notesOf(c: ParityCase): { file: string; text: string }[] {
  const own = join(c.dir, 'note.md');
  if (existsSync(own)) return [{ file: 'note.md', text: readFileSync(own, 'utf8') }];
  const notes: { file: string; text: string }[] = [];
  for (let dir = dirname(c.dir); relative(root, dir) !== '' && !relative(root, dir).startsWith('..'); dir = dirname(dir)) {
    for (const name of readdirSync(dir).sort()) {
      const path = join(dir, name);
      if (/\.(md|txt)$/i.test(name) && statSync(path).isFile()) {
        notes.push({ file: relative(root, path).replaceAll('\\', '/'), text: readFileSync(path, 'utf8') });
      }
    }
  }
  return notes;
}

function counts(s: ChangeSummary): string {
  const parts: string[] = [];
  for (const entity of ['steps', 'hops', 'notes', 'connections'] as const) {
    const c = s[entity];
    const actions = (['added', 'removed', 'renamed', 'modified'] as const)
      .filter((a) => c[a] > 0).map((a) => `${c[a]} ${a}`);
    if (actions.length > 0) parts.push(`${entity}: ${actions.join(', ')}`);
  }
  if (s.document > 0) parts.push(`document: ${s.document}`);
  if (s.other > 0) parts.push(`other: ${s.other}`);
  return parts.length > 0 ? parts.join('; ') : '—';
}

const cell = (s: string): string => s.replaceAll('|', '\\|').replaceAll('\n', ' ');

function fileRow(f: FileRow): string {
  const cs = f.changeSet;
  const unknown = cs.changes.filter((ch) => ch.classification === 'unknown').length;
  const errors = cs.errors.map((e) => e.code + (e.side ? ` (${e.side})` : '')).join(', ') || '—';
  const warnings = cs.warnings.map((w) => w.code).join(', ') || '—';
  const path = f.before === f.after ? f.before ?? '' : `${f.before ?? '∅'} → ${f.after ?? '∅'}`;
  return `| ${cell(path)} | ${f.status} | ${f.method} | ${cs.changes.length} | ${cell(counts(summarizeChanges(cs.changes)))} `
    + `| ${unknown} | ${cell(errors)} | ${cell(warnings)} | ${f.ms === null ? '—' : f.ms.toFixed(0)} |`;
}

afterAll(() => {
  if (cases.length === 0) return;
  const all = [...records.values()];
  const files = all.flatMap((r) => r.files);
  const slowest = Math.max(0, ...files.map((f) => f.ms ?? 0));
  const lines = [
    '# Private parity report (local, never commit)',
    '',
    `Generated ${new Date().toISOString()} by \`npm run parity:private\`. Advanced mode; counts from`,
    '`summarizeChanges`; "unknown" = changes classified unknown; time = one advanced comparison.',
    '',
    `Cases: ${cases.length} · files: ${files.length} · cases with parity differences: `
      + `${all.filter((r) => r.parity.length > 0).length} · differing outputs: `
      + `${all.reduce((n, r) => n + r.parity.length, 0)} · slowest file: ${slowest.toFixed(0)} ms`,
    '',
  ];
  const printedNotes = new Set<string>();
  for (const c of cases) {
    const r = records.get(c.id);
    lines.push(`## ${c.id} (${c.kind})`, '');
    if (r === undefined) { lines.push('Not run.', ''); continue; }
    lines.push(`Parity with the Java oracle: ${r.parity.length === 0 ? 'identical' : `${r.parity.length} differing output(s)`}`, '');
    if (r.parity.length > 0) lines.push('```text', ...r.parity, '```', '');
    if (r.failure !== undefined) lines.push(`TypeScript run failed: ${r.failure}`, '');
    lines.push('| File | Status | Match | Changes | Summary | Unknown | Errors | Warnings | ms |',
      '|---|---|---|---|---|---|---|---|---|', ...r.files.map(fileRow), '');
    const notes = notesOf(c);
    if (notes.length === 0) lines.push('_No note for this case._', '');
    for (const n of notes) {
      // A group note covers several cases: print it once, then refer to it.
      if (printedNotes.has(n.file)) { lines.push(`_Note: ${n.file} (printed above)._`, ''); continue; }
      printedNotes.add(n.file);
      lines.push(`### Note: ${n.file}`, '', '```text', n.text.trimEnd(), '```', '');
    }
  }
  writeFileSync(join(root, '.parity', 'report.md'), lines.join('\n'), 'utf8');
});
