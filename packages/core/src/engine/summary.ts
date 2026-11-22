// Per-file change summary (new in the TypeScript engine, no Java counterpart): counts entities,
// not changes, so the folder view can say "1 step modified" for a step with five property
// changes. Pure function over any change list; callers pass the visible changes of a mode.

import type { Change, ChangeKind } from '../model/change.ts';

export interface CountByAction {
  added: number;
  removed: number;
  renamed: number;
  modified: number;
}

export interface ChangeSummary {
  steps: CountByAction;
  hops: CountByAction;
  notes: CountByAction;
  connections: CountByAction;
  /** Transformation/job-level properties, parameters and root extensions, one per change. */
  document: number;
  /** Unknown XML changes that cannot be attributed to an entity, one per change. */
  other: number;
  /** Number of changes summarized. */
  total: number;
}

type Action = keyof CountByAction;

// Precedence when one identity carries several changes: a renamed step that also changed counts
// as renamed only; an added/removed entity never also counts as modified.
const PRECEDENCE: readonly Action[] = ['added', 'removed', 'renamed', 'modified'];

const ACTIONS: Partial<Record<ChangeKind, Action>> = {
  step_added: 'added', step_removed: 'removed', step_renamed: 'renamed',
  hop_added: 'added', hop_removed: 'removed',
  note_added: 'added', note_removed: 'removed',
  connection_added: 'added', connection_removed: 'removed', connection_renamed: 'renamed',
};

function action(c: Change): Action {
  return ACTIONS[c.kind] ?? 'modified';
}

function stronger(x: Action, y: Action): Action {
  return PRECEDENCE.indexOf(x) <= PRECEDENCE.indexOf(y) ? x : y;
}

/** Field, SQL, script, filter and unknown changes carry the identity of the step they belong to. */
function stepIdentity(c: Change): string | null {
  if (c.logicalId !== null) return 'id:' + c.logicalId;
  if (c.stepName !== null) return 'name:' + c.stepName;
  if (c.entity === 'step') return 'path:' + (c.sourceXmlPath ?? '');
  return null;
}

// Removed entities are named/located in the before document, everything else in the after one:
// the side prefix keeps a removed and an added entity with the same label apart.
function noteIdentity(c: Change): string {
  return (c.kind === 'note_removed' ? 'before:' : 'after:') + (c.sourceXmlPath ?? '');
}

function connectionIdentity(c: Change): string {
  return c.kind === 'connection_removed' ? 'before:' + (c.beforeName ?? '') : 'after:' + (c.afterName ?? c.beforeName ?? '');
}

// Hop changes carry endpoint names, not logical ids; within one comparison the matcher already
// keeps unchanged hops of renamed steps out of the change list, so names identify hops here.
function hopIdentity(c: Change): string {
  return (c.kind === 'hop_removed' ? 'before:' : 'after:') + (c.fromStep ?? '') + '\u0000' + (c.toStep ?? '');
}

function count(identities: ReadonlyMap<string, Action>): CountByAction {
  const result: CountByAction = { added: 0, removed: 0, renamed: 0, modified: 0 };
  for (const a of identities.values()) result[a]++;
  return result;
}

export function summarizeChanges(changes: readonly Change[]): ChangeSummary {
  const steps = new Map<string, Action>();
  const hops = new Map<string, Action>();
  const notes = new Map<string, Action>();
  const connections = new Map<string, Action>();
  let documentCount = 0;
  let other = 0;
  const record = (target: Map<string, Action>, identity: string, a: Action): void => {
    const previous = target.get(identity);
    target.set(identity, previous === undefined ? a : stronger(previous, a));
  };
  for (const c of changes) {
    switch (c.entity) {
      case 'hop':
        record(hops, hopIdentity(c), action(c));
        break;
      case 'note':
        record(notes, noteIdentity(c), action(c));
        break;
      case 'connection':
        record(connections, connectionIdentity(c), action(c));
        break;
      case 'transformation':
        documentCount++;
        break;
      default: {
        const identity = stepIdentity(c);
        if (identity === null) other++;
        else record(steps, identity, action(c));
      }
    }
  }
  return {
    steps: count(steps),
    hops: count(hops),
    notes: count(notes),
    connections: count(connections),
    document: documentCount,
    other,
    total: changes.length,
  };
}
