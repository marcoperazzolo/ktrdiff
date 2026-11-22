// it.ktrdiff.core.engine.StepAdapter, ComparisonContext — per-step-type semantic comparison.
//
// An adapter claims the step child elements it understands via claimedTags(); the generic
// adapter covers everything unclaimed (common envelope, layout, unknown tags), so no data is
// ever lost and nothing is reported twice. Adapters read the step XML as a document: they never
// execute scripts or SQL and never resolve external references.

import type { Change } from '../model/change.ts';
import type { StepModel } from '../model/document.ts';
import type { PentahoVersion } from '../model/pentaho-version.ts';
import type { DiffConfig } from '../profile/diff-config.ts';
import type { XmlNode } from '../xml/xml-node.ts';

export interface StepAdapter {
  /** Java simple class name, reported by adapterNameFor (diagnostics, inspect). */
  readonly name: string;
  /**
   * True when this adapter understands the raw step type. The version is ignored unless a
   * Pentaho release changed the step's semantics; a null version must always be accepted.
   */
  supports(stepType: string | null, version?: PentahoVersion | null): boolean;
  /** Step child element names handled here and therefore skipped by the generic pass. */
  claimedTags(): ReadonlySet<string>;
  compare(before: StepModel, after: StepModel, context: ComparisonContext): Change[];
}

/**
 * Comparison-scoped information handed to adapters: the effective configuration and the display
 * identity of the step pair (for renamed steps, internal changes are reported under the after
 * name, per the fixture schema rules).
 */
export class ComparisonContext {
  readonly config: DiffConfig;
  /** Display name (after side for renames). */
  readonly stepName: string | null;
  /** Raw XML type of the after side. */
  readonly stepType: string | null;
  /** May be null — never required. */
  readonly version: PentahoVersion | null;

  constructor(config: DiffConfig, stepName: string | null, stepType: string | null,
    version: PentahoVersion | null = null) {
    this.config = config;
    this.stepName = stepName;
    this.stepType = stepType;
    this.version = version;
  }

  withStep(name: string | null, type: string | null): ComparisonContext {
    return new ComparisonContext(this.config, name, type, this.version);
  }
}

/** StepModel.xml() as dereferenced by the Java adapters (a NullPointerException there). */
export function stepXml(step: StepModel): XmlNode {
  if (step.xml === null) throw new Error('step without XML: ' + step.name);
  return step.xml;
}

/** The `emptyToNull` helper each Java adapter declares. */
export function emptyToNull(s: string | null): string | null {
  return s === null || s.length === 0 ? null : s;
}
