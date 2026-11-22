// it.ktrdiff.core.fixtures.ExpectedMatcher: checks a ChangeSet against an expected.yml spec.
// Volatile changes (Spoon save artifacts) are exempt from strict counting.

import { changeSetResult, diffErrorToString, sameStepType, type Change, type ChangeSet } from '@ktrdiff/core';
import { javaTrim } from '../java.ts';
import { expectedChangeToString, type ExpectedChange, type ExpectedSpec } from './spec.ts';

export interface MatchResult {
  passed: boolean;
  problems: string[];
}

export function verify(spec: ExpectedSpec, actual: ChangeSet): MatchResult {
  const problems: string[] = [];

  // 1. overall result
  const actualResult = changeSetResult(actual);
  if (spec.result !== actualResult) {
    problems.push("expected result '" + spec.result + "' but was '" + actualResult + "'");
  }

  // 2. error code
  if (spec.result === 'error') {
    if (spec.errorCode !== null && !actual.errors.some((e) => e.code === spec.errorCode)) {
      problems.push("expected error_code '" + spec.errorCode + "' but errors were: " + describeErrors(actual));
    }
    return { passed: problems.length === 0, problems };
  }
  if (actual.errors.length > 0) {
    problems.push('unexpected errors: ' + describeErrors(actual));
    return { passed: false, problems };
  }

  // 3. every expected change must match a distinct actual change
  const unconsumed = actual.changes.filter((c) => !c.volatile);
  for (const expected of spec.changes) {
    const index = unconsumed.findIndex((candidate) => matches(expected, candidate));
    if (index < 0) {
      problems.push('expected change not found: ' + expectedChangeToString(expected)
        + '\n    detected changes were:\n      ' + describeChanges(unconsumed));
    } else {
      unconsumed.splice(index, 1);
    }
  }

  // 4. strict mode: leftovers must be allowed, and functional changes never are
  if (spec.strict) {
    for (const extra of unconsumed) {
      const cls = extra.classification;
      const allowed = spec.allowExtra.includes(cls) && cls !== 'functional';
      if (!allowed) {
        problems.push('strict mode: unexpected change ' + changeToString(extra) + " (classification '" + cls
          + "' not in allow_extra [" + spec.allowExtra.join(', ') + '])');
      }
    }
  }
  return { passed: problems.length === 0, problems };
}

export function matches(e: ExpectedChange, c: Change): boolean {
  if (e.kind !== null && e.kind !== c.kind) return false;
  if (e.classification !== null && e.classification !== c.classification) return false;
  if (e.entity !== null && e.entity !== c.entity) return false;
  if (e.stepType !== null && !sameStepType(e.stepType, c.stepType)) return false;
  if (e.stepName !== null && e.stepName !== c.stepName) return false;
  if (e.beforeName !== null && e.beforeName !== c.beforeName) return false;
  if (e.afterName !== null && e.afterName !== c.afterName) return false;
  if (e.fromStep !== null && e.fromStep !== c.fromStep) return false;
  if (e.toStep !== null && e.toStep !== c.toStep) return false;
  if (e.section !== null && e.section !== c.section) return false;
  if (e.field !== null && e.field !== c.field) return false;
  if (e.property !== null && e.property !== c.property) return false;
  if (e.before !== null && !looseEquals(e.before, c.before)) return false;
  if (e.after !== null && !looseEquals(e.after, c.after)) return false;
  if (e.addedContains.length > 0) {
    const added = c.addedFragments.join('\n');
    if (!e.addedContains.every((fragment) => added.includes(fragment))) return false;
  }
  if (e.removedContains.length > 0) {
    const removed = c.removedFragments.join('\n');
    if (!e.removedContains.every((fragment) => removed.includes(fragment))) return false;
  }
  return true;
}

type Scalar = string | number | boolean | readonly string[] | null;

/** YAML 18 matches "18"; true matches "true"/"Y"; a trailing .0 on doubles is dropped. */
export function looseEquals(expected: Scalar, actual: Scalar): boolean {
  if (expected === null || actual === null) return expected === null && actual === null;
  const e = canonicalScalar(expected);
  const a = canonicalScalar(actual);
  if (e === a) return true;
  // Pentaho boolean spellings
  if (isTrue(e) && isTrue(a)) return true;
  return isFalse(e) && isFalse(a);
}

/** String.valueOf(v).trim(); integral doubles print without fraction (Java `(long) d`). */
function canonicalScalar(v: Exclude<Scalar, null>): string {
  if (typeof v === 'number' && Number.isInteger(v)) return String(v);
  return javaTrim(valueOf(v));
}

/** String.valueOf for change values: lists print as `[a, b]` like java.util.List. */
function valueOf(v: Scalar): string {
  if (v === null) return 'null';
  if (Array.isArray(v)) return '[' + v.join(', ') + ']';
  return String(v);
}

function isTrue(s: string): boolean {
  const v = s.toLowerCase();
  return v === 'true' || v === 'y' || v === 'yes';
}

function isFalse(s: string): boolean {
  const v = s.toLowerCase();
  return v === 'false' || v === 'n' || v === 'no';
}

/** Change.toString: `kind[step or entity, field=…, property=…, before -> after]`. */
export function changeToString(c: Change): string {
  return c.kind + '[' + (c.stepName !== null ? c.stepName : c.entity)
    + (c.field !== null ? ', field=' + c.field : '')
    + (c.property !== null ? ', property=' + c.property : '')
    + (c.before !== null || c.after !== null ? ', ' + valueOf(c.before) + ' -> ' + valueOf(c.after) : '')
    + ']';
}

function describeErrors(actual: ChangeSet): string {
  if (actual.errors.length === 0) return '(none)';
  return actual.errors.map((e) => diffErrorToString(e) + '; ').join('');
}

function describeChanges(changes: readonly Change[]): string {
  if (changes.length === 0) return '(none)';
  return changes.map((c) => changeToString(c) + '\n      ').join('');
}
