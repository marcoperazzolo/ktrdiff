// it.ktrdiff.core.profile.ModeFilter, FilteredChangeSet — presentation-time partition of a complete
// ChangeSet into visible and hidden changes. Pure filtering: detection and classification
// happened earlier and are never altered here; the underlying ChangeSet is untouched.
//
// * Advanced shows every change, volatile save artifacts included.
// * Quick hides layout changes, volatile storage properties and formatting-only SQL/script
//   changes; everything else (functional, metadata such as note text, unknown) stays visible.
// * Custom follows the include map plus the fine-grained switches.

import { CLASSIFICATIONS, type Change, type Classification } from '../model/change.ts';
import type { ChangeSet } from '../model/change-set.ts';
import { includes, type DiffConfig, type Mode } from './diff-config.ts';

export interface FilteredChangeSet {
  readonly changeSet: ChangeSet;
  readonly mode: Mode;
  readonly visible: readonly Change[];
  readonly hidden: readonly Change[];
}

/** ModeFilter.apply. */
export function applyMode(changeSet: ChangeSet, config: DiffConfig): FilteredChangeSet {
  const visible: Change[] = [];
  const hidden: Change[] = [];
  for (const c of changeSet.changes) {
    if (isVisible(c, config)) visible.push(c);
    else hidden.push(c);
  }
  return Object.freeze({
    changeSet,
    mode: config.mode,
    visible: Object.freeze(visible),
    hidden: Object.freeze(hidden),
  });
}

/**
 * FilteredChangeSet.hiddenCounts: hidden change counts per classification (volatile storage noise
 * counts as metadata). Keys follow the enum order like Java's EnumMap and only classifications
 * with at least one hidden change are present.
 */
export function hiddenCounts(filtered: FilteredChangeSet): Map<Classification, number> {
  const raw = new Map<Classification, number>();
  for (const c of filtered.hidden) raw.set(c.classification, (raw.get(c.classification) ?? 0) + 1);
  const counts = new Map<Classification, number>();
  for (const c of CLASSIFICATIONS) {
    const n = raw.get(c);
    if (n !== undefined) counts.set(c, n);
  }
  return counts;
}

export function isVisible(c: Change, config: DiffConfig): boolean {
  switch (config.mode) {
    case 'advanced':
      return true;
    case 'quick':
      if (c.volatile) return false;
      if (c.classification === 'layout') return false;
      if (isFormattingOnly(c)) return false;
      return true;
    case 'custom':
    default:
      if (c.volatile) return false; // storage noise is Advanced-only
      if (!includes(config, c.classification)) return false;
      if (c.kind === 'step_moved' && !config.layoutStepPositions) return false;
      if (c.kind === 'note_moved' && !config.layoutNotePositions) return false;
      if (c.kind === 'note_changed' && c.property === 'text' && !config.notesContent) return false;
      // renames are identity-preserving; hiding them is safe
      if (c.kind === 'step_renamed' && !config.showRenames) return false;
      return true;
  }
}

function isFormattingOnly(c: Change): boolean {
  return (c.kind === 'sql_changed' && c.property === 'formatting')
    || (c.kind === 'script_changed' && c.property === 'whitespace');
}
