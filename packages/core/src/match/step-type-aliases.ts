// it.ktrdiff.core.match.StepTypeAliases — known alternate spellings of Pentaho step type IDs.
// KTR files store the plugin ID (ScriptValueMod); docs and some tooling use the display-name form.
// The engine reports the raw XML type; comparisons go through canonical(). Ported in E1 because
// SemanticStep needs it; StepMatcher (E2) is its other user.

import { javaTrim } from '../util/java.ts';

const ALIASES: ReadonlyMap<string, string> = new Map([
  ['ModifiedJavaScriptValue', 'ScriptValueMod'],
  ['Modified Java Script Value', 'ScriptValueMod'],
  ['ModifiedJavaScriptValues', 'ScriptValueMod'],
]);

export function canonicalStepType(stepType: string): string;
export function canonicalStepType(stepType: string | null): string | null;
export function canonicalStepType(stepType: string | null): string | null {
  if (stepType === null) return null;
  const t = javaTrim(stepType);
  return ALIASES.get(t) ?? t;
}

export function sameStepType(a: string | null, b: string | null): boolean {
  const ca = canonicalStepType(a);
  const cb = canonicalStepType(b);
  return ca === null ? cb === null : ca === cb;
}
