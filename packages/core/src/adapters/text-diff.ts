// it.ktrdiff.core.adapters.TextDiff — line-based text diff used for SQL and script bodies.
// Newlines are normalized first; deltas come from the java-diff-utils Myers port.

import { normalizeText } from '../normalize/normalizer.ts';
import { javaSplit } from '../util/java.ts';
import { diffDeltas } from './myers.ts';

export interface TextDiff {
  readonly addedLines: readonly string[];
  readonly removedLines: readonly string[];
  /** Simple unified-style raw diff for display. */
  readonly unified: string;
}

export function textDiff(before: string | null, after: string | null): TextDiff {
  const b = splitLines(normalizeText(before));
  const a = splitLines(normalizeText(after));
  const added: string[] = [];
  const removed: string[] = [];
  let unified = '';
  for (const delta of diffDeltas(b, a)) {
    for (const line of delta.source.lines) {
      removed.push(line);
      unified += '- ' + line + '\n';
    }
    for (const line of delta.target.lines) {
      added.push(line);
      unified += '+ ' + line + '\n';
    }
  }
  return { addedLines: added, removedLines: removed, unified };
}

export function isEmptyTextDiff(d: TextDiff): boolean {
  return d.addedLines.length === 0 && d.removedLines.length === 0;
}

function splitLines(s: string | null): string[] {
  if (s === null || s.length === 0) return [];
  return javaSplit(s, '\n', -1);
}
