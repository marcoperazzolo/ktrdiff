// it.ktrdiff.core.model.ChangeSet, MatchingDecision — complete result of a comparison, before any
// presentation-mode filtering.

import { CLASSIFICATIONS, type Change, type Classification } from './change.ts';
import type { DiffError, DiffWarning } from './errors.ts';
import { emptyGraphView, type GraphView } from './graph.ts';

export const SCHEMA_VERSION = 1;

/** Record of one step-matching decision, for the Advanced view and diagnostics. */
export interface MatchingDecision {
  readonly beforeStep: string | null;
  readonly afterStep: string | null;
  /** name | fingerprint | similarity | unmatched | ambiguous */
  readonly method: string;
  readonly score: number;
  readonly detail: string | null;
}

export interface ChangeSet {
  readonly schemaVersion: number;
  readonly changes: readonly Change[];
  readonly warnings: readonly DiffWarning[];
  readonly errors: readonly DiffError[];
  readonly matchingDecisions: readonly MatchingDecision[];
  /** Insertion-ordered like the Java LinkedHashMap. */
  readonly metadata: ReadonlyMap<string, string>;
  readonly graph: GraphView;
}

export function changeSet(
  changes: readonly Change[],
  warnings: readonly DiffWarning[],
  errors: readonly DiffError[],
  matchingDecisions: readonly MatchingDecision[],
  metadata: ReadonlyMap<string, string>,
  graph: GraphView | null = null,
): ChangeSet {
  return {
    schemaVersion: SCHEMA_VERSION,
    changes: [...changes],
    warnings: [...warnings],
    errors: [...errors],
    matchingDecisions: [...matchingDecisions],
    metadata: new Map(metadata),
    graph: graph ?? emptyGraphView(),
  };
}

export function hasErrors(cs: ChangeSet): boolean {
  return cs.errors.length > 0;
}

/**
 * Overall result: error when a controlled error occurred, changed when at least one non-volatile
 * change exists, unchanged otherwise. Volatile Spoon save artifacts alone do not make two
 * documents "changed".
 */
export function changeSetResult(cs: ChangeSet): 'error' | 'changed' | 'unchanged' {
  if (hasErrors(cs)) return 'error';
  for (const c of cs.changes) {
    if (!c.volatile) return 'changed';
  }
  return 'unchanged';
}

/** Change counts per classification in enum order, volatile changes excluded (Java EnumMap). */
export function classificationSummary(cs: ChangeSet): Map<Classification, number> {
  const counts = new Map<Classification, number>();
  for (const c of CLASSIFICATIONS) counts.set(c, 0);
  for (const c of cs.changes) {
    if (!c.volatile) counts.set(c.classification, (counts.get(c.classification) ?? 0) + 1);
  }
  return counts;
}
