// it.ktrdiff.core.render.JsonRenderer — versioned, stable JSON output (schemaVersion 1). Keys are
// inserted in the fixed Java order; nullable fields are written as null like Jackson's put(key,
// null). Whitespace differs from Jackson's pretty printer (intentional difference D5).

import type { Change, ChangeValue } from '../model/change.ts';
import { changeSetResult, classificationSummary, type ChangeSet } from '../model/change-set.ts';
import type { DiffConfig } from '../profile/diff-config.ts';
import { applyMode, hiddenCounts } from '../profile/mode-filter.ts';

export type Json = null | boolean | number | string | readonly Json[] | { readonly [key: string]: Json };

export function renderJson(cs: ChangeSet, config: DiffConfig): string {
  return JSON.stringify(changeSetJson(cs, config), null, 2);
}

/** The JSON tree of one comparison; the directory renderer embeds it as `comparison`. */
export function changeSetJson(cs: ChangeSet, config: DiffConfig): Record<string, Json> {
  const filtered = applyMode(cs, config);
  const counts = classificationSummary(cs);
  const hiddenBy: Record<string, Json> = {};
  for (const [cls, n] of hiddenCounts(filtered)) hiddenBy[cls] = n;
  const metadata: Record<string, Json> = {};
  for (const [k, v] of cs.metadata) metadata[k] = v;

  const root: Record<string, Json> = {
    schemaVersion: cs.schemaVersion,
    mode: config.mode,
    result: changeSetResult(cs),
    summary: {
      functional: counts.get('functional') ?? 0,
      layout: counts.get('layout') ?? 0,
      metadata: counts.get('metadata') ?? 0,
      configuration: counts.get('configuration') ?? 0,
      potentiallyFunctional: counts.get('potentially-functional') ?? 0,
      unknown: counts.get('unknown') ?? 0,
    },
    hidden: { count: filtered.hidden.length, byClassification: hiddenBy },
    metadata,
    graph: {
      steps: cs.graph.steps.map((s) => ({
        logicalId: s.logicalId,
        beforeName: s.beforeName,
        afterName: s.afterName,
        type: s.type,
        beforeX: s.beforeX,
        beforeY: s.beforeY,
        afterX: s.afterX,
        afterY: s.afterY,
        status: s.status,
        adapter: s.adapter,
        changeCount: s.changeCount,
      })),
      hops: cs.graph.hops.map((h) => ({
        fromLogicalId: h.fromLogicalId,
        toLogicalId: h.toLogicalId,
        fromName: h.fromName,
        toName: h.toName,
        status: h.status,
        enabled: h.enabled,
      })),
    },
    changes: filtered.visible.map((c) => changeNode(c, config)),
    hiddenChanges: filtered.hidden.map((c) => changeNode(c, config)),
    warnings: cs.warnings.map((w) => ({ code: w.code, message: w.message })),
    errors: cs.errors.map((e) => ({ code: e.code, message: e.message, side: e.side })),
    matchingDecisions: cs.matchingDecisions.map((d) => ({
      before: d.beforeStep,
      after: d.afterStep,
      method: d.method,
      score: d.score,
      detail: d.detail,
    })),
  };
  return root;
}

function changeNode(c: Change, config: DiffConfig): Record<string, Json> {
  const n: Record<string, Json> = {
    id: c.id,
    logicalId: c.logicalId,
    kind: c.kind,
    classification: c.classification,
    entity: c.entity,
    stepType: c.stepType,
    stepName: c.stepName,
    beforeName: c.beforeName,
    afterName: c.afterName,
    fromStep: c.fromStep,
    toStep: c.toStep,
    section: c.section,
    field: c.field,
    property: c.property,
    before: jsonValue(c.before),
    after: jsonValue(c.after),
    addedFragments: [...c.addedFragments],
    removedFragments: [...c.removedFragments],
    volatile: c.volatile,
  };
  if (c.confidence !== null) n.confidence = c.confidence;
  if (config.showXmlPaths) n.sourceXmlPath = c.sourceXmlPath;
  if (config.showRawDiff && c.rawDiff !== null) n.rawDiff = c.rawDiff;
  return n;
}

/** JsonRenderer.putValue: booleans and numbers stay typed, anything else is String.valueOf. */
function jsonValue(v: ChangeValue): Json {
  if (v === null || typeof v === 'boolean' || typeof v === 'number' || typeof v === 'string') return v;
  return '[' + v.join(', ') + ']';
}
