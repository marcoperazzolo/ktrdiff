// DiffEngine.buildGraph — projection for visual overlays: identities, both positions, statuses, hops.

import type { Change } from '../model/change.ts';
import type { TransformationModel } from '../model/document.ts';
import { stepViewDisplayName, type GraphView, type HopView, type StepView } from '../model/graph.ts';
import type { MatchResult } from '../match/step-matcher.ts';
import { compareUtf16, javaSplit } from '../util/java.ts';
import type { AdapterRegistry } from './adapter-registry.ts';
import { hopEntries, logicalIdsByName } from './compare-hops.ts';

export function buildGraph(registry: AdapterRegistry, before: TransformationModel, after: TransformationModel,
  match: MatchResult, changes: readonly Change[]): GraphView {
  const stepViews: StepView[] = [];
  const byStep = new Map<string, Change[]>();
  for (const c of changes) {
    if (c.logicalId !== null && !c.volatile) {
      let list = byStep.get(c.logicalId);
      if (list === undefined) {
        list = [];
        byStep.set(c.logicalId, list);
      }
      list.push(c);
    }
  }
  // Java getOrDefault(null, …) on a LinkedHashMap without null keys yields the default.
  const changesOf = (logicalId: string | null): readonly Change[] =>
    (logicalId === null ? undefined : byStep.get(logicalId)) ?? [];

  for (const p of match.pairs) {
    const stepChanges = changesOf(p.after.logicalId);
    let moved = false;
    let unknown = false;
    let modified = false;
    for (const c of stepChanges) {
      if (c.kind === 'step_moved') moved = true;
      else if (c.kind === 'unknown_change') unknown = true;
      else if (c.kind !== 'step_renamed') modified = true;
    }
    let status: string;
    if (p.isRename()) status = 'renamed';
    else if (unknown) status = 'unknown';
    else if (modified) status = 'modified';
    else if (moved) status = 'moved';
    else status = 'unchanged';
    stepViews.push({
      logicalId: p.after.logicalId, beforeName: p.before.name, afterName: p.after.name, type: p.after.type,
      beforeX: p.before.xloc, beforeY: p.before.yloc, afterX: p.after.xloc, afterY: p.after.yloc,
      status, adapter: registry.adapterNameFor(p.after.type), changeCount: stepChanges.length,
    });
  }
  for (const s of match.removedSteps) {
    stepViews.push({
      logicalId: s.logicalId, beforeName: s.name, afterName: null, type: s.type,
      beforeX: s.xloc, beforeY: s.yloc, afterX: null, afterY: null,
      status: 'removed', adapter: registry.adapterNameFor(s.type), changeCount: changesOf(s.logicalId).length,
    });
  }
  for (const s of match.addedSteps) {
    stepViews.push({
      logicalId: s.logicalId, beforeName: null, afterName: s.name, type: s.type,
      beforeX: null, beforeY: null, afterX: s.xloc, afterY: s.yloc,
      status: 'added', adapter: registry.adapterNameFor(s.type), changeCount: changesOf(s.logicalId).length,
    });
  }
  // Comparator.comparing(displayName, nullsLast(naturalOrder())); Array.sort is stable like List.sort.
  stepViews.sort((x, y) => {
    const a = stepViewDisplayName(x);
    const b = stepViewDisplayName(y);
    if (a === null) return b === null ? 0 : 1;
    if (b === null) return -1;
    return compareUtf16(a, b);
  });

  const hopViews: HopView[] = [];
  const bHops = hopEntries(before, logicalIdsByName(before));
  const aHops = hopEntries(after, logicalIdsByName(after));
  const hopKeys = new Set<string>(bHops.keys());
  for (const k of aHops.keys()) hopKeys.add(k);
  for (const key of hopKeys) {
    const hb = bHops.get(key);
    const ha = aHops.get(key);
    const ids = javaSplit(key, '->', 2);
    // Every key contains "->", so both parts exist.
    const fromId = ids[0]!;
    const toId = ids[1]!;
    if (ha !== undefined && hb !== undefined) {
      hopViews.push({ fromLogicalId: fromId, toLogicalId: toId, fromName: ha.from, toName: ha.to,
        status: hb.enabled !== ha.enabled ? 'changed' : 'unchanged', enabled: ha.enabled });
    } else if (ha !== undefined) {
      hopViews.push({ fromLogicalId: fromId, toLogicalId: toId, fromName: ha.from, toName: ha.to,
        status: 'added', enabled: ha.enabled });
    } else {
      hopViews.push({ fromLogicalId: fromId, toLogicalId: toId, fromName: hb!.from, toName: hb!.to,
        status: 'removed', enabled: hb!.enabled });
    }
  }
  return { steps: stepViews, hops: hopViews };
}
