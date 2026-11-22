// it.ktrdiff.core.match.StepMatcher, MatchResult — deterministic three-pass step matching
// (docs/matching.md): 1) equal trimmed names; 2) identical semantic signature (exact rename);
// 3) same-type similarity in iterative rounds where accepted pairs become anchors that sharpen
// the next round, so renames cascade along the graph. Near-ties within AMBIGUITY_MARGIN raise
// ambiguous_step_match and the steps stay added/removed. Matched pairs share a logical id so hop
// comparison is immune to renames; leftovers record their closest below-threshold candidate.

import type { MatchingDecision } from '../model/change-set.ts';
import type { StepModel, TransformationModel } from '../model/document.ts';
import { diffWarning, type DiffWarning } from '../model/errors.ts';
import { semanticSignature } from '../normalize/semantic-step.ts';
import { compareUtf16, javaDoubleToString, javaFormatFixed } from '../util/java.ts';
import { similarityScore } from './similarity.ts';
import { sameStepType } from './step-type-aliases.ts';

export const DEFAULT_THRESHOLD = 0.70;
export const AMBIGUITY_MARGIN = 0.05;
const MAX_ROUNDS = 12;

export type MatchMethod = 'name' | 'fingerprint' | 'similarity';

export class StepPair {
  readonly before: StepModel;
  readonly after: StepModel;
  readonly method: MatchMethod;
  readonly score: number;

  constructor(before: StepModel, after: StepModel, method: MatchMethod, score: number) {
    this.before = before;
    this.after = after;
    this.method = method;
    this.score = score;
  }

  isRename(): boolean {
    return this.before.name !== this.after.name;
  }
}

export interface MatchResult {
  readonly pairs: readonly StepPair[];
  readonly removedSteps: readonly StepModel[];
  readonly addedSteps: readonly StepModel[];
  readonly warnings: readonly DiffWarning[];
  readonly decisions: readonly MatchingDecision[];
}

interface Candidate {
  readonly before: StepModel;
  readonly after: StepModel;
  readonly score: number;
}

function decision(beforeStep: string | null, afterStep: string | null, method: string, score: number,
  detail: string | null): MatchingDecision {
  return { beforeStep, afterStep, method, score, detail };
}

/** Java List.remove(Object): StepModel has identity equality. */
function removeFirst(list: StepModel[], item: StepModel): void {
  const i = list.indexOf(item);
  if (i >= 0) list.splice(i, 1);
}

function round3(v: number): number {
  return Math.round(v * 1000.0) / 1000.0;
}

export function matchSteps(before: TransformationModel, after: TransformationModel,
  threshold: number = DEFAULT_THRESHOLD): MatchResult {
  const pairs: StepPair[] = [];
  const warnings: DiffWarning[] = [];
  const decisions: MatchingDecision[] = [];

  let beforeLeft = [...before.steps];
  let afterLeft = [...after.steps];

  // Pass 1 — same trimmed name. Type differences are reported later as critical changes, but
  // the step keeps its identity. Later duplicates overwrite earlier ones, as in LinkedHashMap.
  const afterByName = new Map<string, StepModel>();
  for (const s of afterLeft) afterByName.set(s.name, s);
  for (const b of [...beforeLeft]) {
    const a = afterByName.get(b.name);
    if (a !== undefined) {
      pairs.push(new StepPair(b, a, 'name', 1.0));
      decisions.push(decision(b.name, a.name, 'name', 1.0, null));
      removeFirst(beforeLeft, b);
      removeFirst(afterLeft, a);
      afterByName.delete(b.name);
    }
  }

  // Anchor map: neighbours already matched count via a shared anchor id.
  const beforeAnchors = new Map<string, string>();
  const afterAnchors = new Map<string, string>();
  let anchorSeq = 0;
  for (const p of pairs) {
    const id = 'm' + (++anchorSeq);
    beforeAnchors.set(p.before.name, id);
    afterAnchors.set(p.after.name, id);
  }

  // Pass 2 — exact semantic signature (rename with identical content). Identical
  // configurations do not imply identical graph identities: only unique groups pair; duplicates
  // are left to the similarity rounds, never paired alphabetically.
  const beforeBySig = groupBySignature(beforeLeft, beforeAnchors);
  const afterBySig = groupBySignature(afterLeft, afterAnchors);
  for (const [sig, bs] of beforeBySig) {
    const as = afterBySig.get(sig);
    if (as === undefined) continue;
    if (bs.length !== 1 || as.length !== 1) continue;
    const b = bs[0]!;
    const a = as[0]!;
    pairs.push(new StepPair(b, a, 'fingerprint', 1.0));
    decisions.push(decision(b.name, a.name, 'fingerprint', 1.0, 'identical semantic content, name differs'));
    removeFirst(beforeLeft, b);
    removeFirst(afterLeft, a);
    const id = 'm' + (++anchorSeq);
    beforeAnchors.set(b.name, id);
    afterAnchors.set(a.name, id);
  }

  // Pass 3 — similarity for the remainder, same canonical type only, in iterative rounds.
  const ambiguous = new Set<StepModel>();
  for (let round = 1; round <= MAX_ROUNDS; round++) {
    ambiguous.clear();
    const roundWarnings: DiffWarning[] = [];
    const roundDecisions: MatchingDecision[] = [];
    const candidates: Candidate[] = [];
    for (const b of beforeLeft) {
      if (ambiguous.has(b)) continue;
      for (const a of afterLeft) {
        if (ambiguous.has(a) || !sameStepType(b.type, a.type)) continue;
        const score = similarityScore(b, a, before, after, beforeAnchors, afterAnchors);
        if (score >= threshold - AMBIGUITY_MARGIN) candidates.push({ before: b, after: a, score });
      }
    }
    // Scores are > 0 here, so negating cannot hit Double.compare's -0.0/0.0 distinction.
    candidates.sort((x, y) => (-x.score) - (-y.score) || compareUtf16(x.before.name, y.before.name)
      || compareUtf16(x.after.name, y.after.name));

    const consumed = new Set<StepModel>();
    let progress = false;
    for (const c of candidates) {
      if (consumed.has(c.before) || consumed.has(c.after) || ambiguous.has(c.before) || ambiguous.has(c.after)) {
        continue;
      }
      if (c.score < threshold) continue;
      const rivals: Candidate[] = [];
      for (const other of candidates) {
        if (other === c || consumed.has(other.before) || consumed.has(other.after)) continue;
        const sharesEndpoint = other.before === c.before || other.after === c.after;
        if (sharesEndpoint && other.score >= c.score - AMBIGUITY_MARGIN) rivals.push(other);
      }
      if (rivals.length > 0) {
        ambiguous.add(c.before);
        ambiguous.add(c.after);
        let detail = `best: ${c.before.name} -> ${c.after.name} (${javaFormatFixed(c.score, 3)}); rivals:`;
        for (const r of rivals) {
          ambiguous.add(r.before);
          ambiguous.add(r.after);
          detail += ` ${r.before.name} -> ${r.after.name} (${javaFormatFixed(r.score, 3)});`;
        }
        roundWarnings.push(diffWarning('ambiguous_step_match',
          'Multiple rename candidates with similar scores — steps kept as removed/added. ' + detail));
        roundDecisions.push(decision(c.before.name, c.after.name, 'ambiguous', round3(c.score), detail));
        continue;
      }
      pairs.push(new StepPair(c.before, c.after, 'similarity', round3(c.score)));
      decisions.push(decision(c.before.name, c.after.name, 'similarity', round3(c.score),
        'probable rename with modification (round ' + round + ')'));
      consumed.add(c.before);
      consumed.add(c.after);
      const id = 'm' + (++anchorSeq);
      beforeAnchors.set(c.before.name, id);
      afterAnchors.set(c.after.name, id);
      progress = true;
    }
    beforeLeft = beforeLeft.filter((s) => !consumed.has(s));
    afterLeft = afterLeft.filter((s) => !consumed.has(s));
    if (!progress) {
      // Only the last (non-progressing) round's ambiguity diagnostics are kept, as in Java.
      warnings.push(...roundWarnings);
      decisions.push(...roundDecisions);
      break;
    }
  }

  // Diagnostics for the leftovers: closest below-threshold candidate, when any.
  for (const s of beforeLeft) {
    let best: Candidate | null = null;
    for (const a of afterLeft) {
      if (!sameStepType(s.type, a.type)) continue;
      const score = similarityScore(s, a, before, after, beforeAnchors, afterAnchors);
      if (best === null || score > best.score) best = { before: s, after: a, score };
    }
    if (best !== null && best.score > 0.30) {
      decisions.push(decision(s.name, best.after.name, 'near-miss', round3(best.score),
        'closest candidate below rename threshold ' + javaDoubleToString(threshold)));
    } else {
      decisions.push(decision(s.name, null, 'unmatched', 0.0, 'step removed'));
    }
  }
  for (const s of afterLeft) decisions.push(decision(null, s.name, 'unmatched', 0.0, 'step added'));

  assignLogicalIds(pairs, beforeLeft, afterLeft);
  return { pairs, removedSteps: beforeLeft, addedSteps: afterLeft, warnings, decisions };
}

function assignLogicalIds(pairs: readonly StepPair[], removed: readonly StepModel[],
  added: readonly StepModel[]): void {
  let seq = 0;
  for (const p of pairs) {
    const id = 'L' + (++seq);
    p.before.assignLogicalId(id);
    p.after.assignLogicalId(id);
  }
  for (const s of removed) s.assignLogicalId('B' + (++seq));
  for (const s of added) s.assignLogicalId('A' + (++seq));
}

function groupBySignature(steps: readonly StepModel[], anchors: ReadonlyMap<string, string>): Map<string, StepModel[]> {
  // Insertion-ordered like the Java LinkedHashMap.
  const map = new Map<string, StepModel[]>();
  for (const s of steps) {
    const sig = semanticSignature(s, anchors);
    const group = map.get(sig);
    if (group === undefined) map.set(sig, [s]);
    else group.push(s);
  }
  return map;
}
