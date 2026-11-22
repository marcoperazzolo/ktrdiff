// Word-level diff of two texts, for showing a changed query or script as readable text: removed
// words struck through, added words highlighted, the rest unchanged. Presentation only: detection
// uses the line diff of text-diff.ts, which the parity tests check against the Java oracle.

import { diffDeltas } from './myers.ts';

export type WordOp = 'equal' | 'removed' | 'added';

export interface WordPart {
  readonly op: WordOp;
  readonly text: string;
}

/** Words (letters, digits, `_ $ @ #`), runs of whitespace, or one other character each. */
const TOKEN = /\s+|[\p{L}\p{N}_$@#]+|[^\s\p{L}\p{N}_$@#]/gu;

export type RowKind = 'equal' | 'changed' | 'removed' | 'added';

/** One line of a side-by-side view; null on the side where the line does not exist. */
export interface AlignedRow {
  readonly kind: RowKind;
  readonly before: string | null;
  readonly after: string | null;
}

/**
 * Lines of two texts aligned for a side-by-side view, as in a Git client: unchanged lines face
 * each other, a changed block pairs its removed and added lines one by one (the longer side
 * continues against empty cells).
 *
 *   SELECT a          SELECT a          equal
 *   FROM t            FROM t2           changed
 *                     WHERE x = 1       added
 */
export function alignLines(before: string, after: string): AlignedRow[] {
  const b = before.split('\n');
  const a = after.split('\n');
  const rows: AlignedRow[] = [];
  let i = 0; // next line of `before` not yet emitted
  let j = 0; // next line of `after` not yet emitted
  const equalUntil = (end: number): void => {
    for (; i < end; i++, j++) rows.push({ kind: 'equal', before: b[i]!, after: a[j]! });
  };
  for (const delta of diffDeltas(b, a)) {
    equalUntil(delta.source.position);
    const removed = delta.source.lines, added = delta.target.lines;
    for (let k = 0; k < Math.max(removed.length, added.length); k++) {
      const left = removed[k] ?? null, right = added[k] ?? null;
      rows.push({ kind: left !== null && right !== null ? 'changed' : left !== null ? 'removed' : 'added', before: left, after: right });
    }
    i = delta.source.position + removed.length;
    j = delta.target.position + added.length;
  }
  equalUntil(b.length);
  return rows;
}

/** Joining the `equal`+`removed` parts gives `before`; joining `equal`+`added` gives `after`. */
export function wordDiff(before: string, after: string): WordPart[] {
  const b = before.match(TOKEN) ?? [];
  const a = after.match(TOKEN) ?? [];
  const parts: WordPart[] = [];
  const push = (op: WordOp, tokens: readonly string[]): void => {
    if (tokens.length === 0) return;
    const last = parts[parts.length - 1];
    if (last !== undefined && last.op === op) parts[parts.length - 1] = { op, text: last.text + tokens.join('') };
    else parts.push({ op, text: tokens.join('') });
  };
  let next = 0; // first token of `before` not yet emitted
  for (const delta of diffDeltas(b, a)) {
    push('equal', b.slice(next, delta.source.position));
    push('removed', delta.source.lines);
    push('added', delta.target.lines);
    next = delta.source.position + delta.source.lines.length;
  }
  push('equal', b.slice(next));
  return parts;
}
