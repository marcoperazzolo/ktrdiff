// it.ktrdiff.core.model.GraphView — graph-oriented projection of the comparison for visual
// overlays: logical identities, both names, both positions, hop endpoints and a per-step status.
// Removed steps keep their before-side position; added steps use the after side.

/** added, removed, renamed, modified, moved, unknown, unchanged. */
export interface StepView {
  readonly logicalId: string | null;
  readonly beforeName: string | null;
  readonly afterName: string | null;
  readonly type: string;
  readonly beforeX: number | null;
  readonly beforeY: number | null;
  readonly afterX: number | null;
  readonly afterY: number | null;
  readonly status: string;
  /** Semantic adapter simple name, or "generic". */
  readonly adapter: string;
  readonly changeCount: number;
}

export interface HopView {
  readonly fromLogicalId: string | null;
  readonly toLogicalId: string | null;
  readonly fromName: string;
  readonly toName: string;
  /** added | removed | changed | unchanged */
  readonly status: string;
  readonly enabled: boolean;
}

export interface GraphView {
  readonly steps: readonly StepView[];
  readonly hops: readonly HopView[];
}

export function emptyGraphView(): GraphView {
  return { steps: [], hops: [] };
}

/** Preferred display name (after side when present). */
export function stepViewDisplayName(s: StepView): string | null {
  return s.afterName !== null ? s.afterName : s.beforeName;
}
