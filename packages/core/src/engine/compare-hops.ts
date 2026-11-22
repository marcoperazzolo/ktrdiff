// DiffEngine.compareHops and its helpers: hops are keyed by the logical identities of their
// endpoints, so a renamed step keeps its hops and produces no hop churn.

import { change, type Change } from '../model/change.ts';
import type { HopModel, TransformationModel } from '../model/document.ts';

/** Trimmed step name -> logical id (Java HashMap: lookups only, iteration order never used). */
export function logicalIdsByName(trans: TransformationModel): Map<string, string> {
  const ids = new Map<string, string>();
  for (const s of trans.steps) {
    if (s.logicalId !== null) ids.set(s.name, s.logicalId);
  }
  return ids;
}

/** "fromId->toId" -> first hop with those endpoints; unknown endpoints become "?:" + name. */
export function hopEntries(trans: TransformationModel, ids: ReadonlyMap<string, string>): Map<string, HopModel> {
  const map = new Map<string, HopModel>();
  for (const h of trans.hops) {
    const from = ids.get(h.from) ?? '?:' + h.from;
    const to = ids.get(h.to) ?? '?:' + h.to;
    const key = from + '->' + to;
    if (!map.has(key)) map.set(key, h);
  }
  return map;
}

export function compareHops(before: TransformationModel, after: TransformationModel, changes: Change[]): void {
  const b = hopEntries(before, logicalIdsByName(before));
  const a = hopEntries(after, logicalIdsByName(after));
  const keys = new Set<string>(b.keys());
  for (const k of a.keys()) keys.add(k);
  for (const key of keys) {
    const hb = b.get(key);
    const ha = a.get(key);
    if (hb !== undefined && ha === undefined) {
      changes.push(change('hop_removed', 'functional', 'hop')
        .fromStep(hb.from).toStep(hb.to)
        .section('hops')
        .before(true).after(false)
        .build());
    } else if (hb === undefined) {
      // Keys come from one of the two maps, so ha is defined here.
      changes.push(change('hop_added', 'functional', 'hop')
        .fromStep(ha!.from).toStep(ha!.to)
        .section('hops')
        .before(false).after(true)
        .build());
    } else if (ha !== undefined && hb.enabled !== ha.enabled) {
      changes.push(change('hop_changed', 'functional', 'hop')
        .fromStep(ha.from).toStep(ha.to)
        .section('hops').property('enabled')
        .before(hb.enabled).after(ha.enabled)
        .build());
    }
  }
}
