// it.ktrdiff.core.engine.AdapterRegistry — explicit adapter registry: no discovery, deterministic
// dispatch order (specific adapters first, then the configured schemas in declaration order).

import { ConfiguredStepAdapter } from '../adapters/configured.ts';
import { FilterRowsAdapter } from '../adapters/filter-rows.ts';
import { GenericStepAdapter } from '../adapters/generic.ts';
import { ScriptValueModAdapter } from '../adapters/script-value-mod.ts';
import { SelectValuesAdapter } from '../adapters/select-values.ts';
import { TableInputAdapter } from '../adapters/table-input.ts';
import type { PentahoVersion } from '../model/pentaho-version.ts';
import type { StepAdapter } from './step-adapter.ts';

function defaultAdapters(): StepAdapter[] {
  return [
    new SelectValuesAdapter(),
    new FilterRowsAdapter(),
    new TableInputAdapter(),
    new ScriptValueModAdapter(),
    ...ConfiguredStepAdapter.all(),
  ];
}

export class AdapterRegistry {
  private readonly specific: readonly StepAdapter[];
  readonly generic = new GenericStepAdapter();

  constructor(specificAdapters: readonly StepAdapter[] = defaultAdapters()) {
    this.specific = [...specificAdapters];
  }

  /** The specific adapter for a raw step type, or null when only the generic one applies. */
  specificFor(stepType: string | null): StepAdapter | null {
    return this.findAdapter(stepType, null);
  }

  /**
   * Version-aware lookup: the first adapter supporting the type for the given Pentaho version
   * (null version = version-independent). The generic fallback is always available separately,
   * so no step type is ever ignored.
   */
  findAdapter(stepType: string | null, version: PentahoVersion | null): StepAdapter | null {
    for (const a of this.specific) {
      if (a.supports(stepType, version)) return a;
    }
    return null;
  }

  /** Human-readable adapter name for a step type (diagnostics, inspect command). */
  adapterNameFor(stepType: string | null): string {
    const a = this.specificFor(stepType);
    return a === null ? 'generic' : a.name;
  }
}
