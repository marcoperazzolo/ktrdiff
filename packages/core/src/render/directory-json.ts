// it.ktrdiff.core.render.DirectoryJsonRenderer — directory result as JSON (schemaVersion 1); each
// file embeds the regular comparison JSON. Whitespace differs from Jackson (D5); files[].summary
// is new (D2).

import type { DirectoryResult, FileStatus } from '../engine/directory-engine.ts';
import type { ChangeSummary, CountByAction } from '../engine/summary.ts';
import type { DiffConfig } from '../profile/diff-config.ts';
import { changeSetJson, type Json } from './json.ts';

const STATUSES: readonly FileStatus[] = ['added', 'removed', 'renamed', 'modified', 'unchanged', 'error'];

export function renderDirectoryJson(result: DirectoryResult, config: DiffConfig): string {
  const summary: Record<string, Json> = {};
  for (const status of STATUSES) summary[status] = result.files.filter((f) => f.status === status).length;
  const root: Record<string, Json> = {
    schemaVersion: 1,
    scope: 'directory',
    summary,
    warnings: result.warnings.map((w) => ({ code: w.code, message: w.message })),
    files: result.files.map((f) => ({
      beforePath: f.beforePath,
      afterPath: f.afterPath,
      status: f.status,
      method: f.method,
      summary: summaryJson(f.summary),
      comparison: changeSetJson(f.changeSet, config),
    })),
  };
  return JSON.stringify(root, null, 2);
}

function countsJson(c: CountByAction): Record<string, Json> {
  return { added: c.added, removed: c.removed, renamed: c.renamed, modified: c.modified };
}

function summaryJson(s: ChangeSummary): Record<string, Json> {
  return {
    steps: countsJson(s.steps),
    hops: countsJson(s.hops),
    notes: countsJson(s.notes),
    connections: countsJson(s.connections),
    document: s.document,
    other: s.other,
    total: s.total,
  };
}
