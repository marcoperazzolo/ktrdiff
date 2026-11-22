// it.ktrdiff.core.match.Similarity — score in [0, 1] between two same-type steps
// (docs/matching.md): score = 0.58*config + 0.21*structure + 0.11*position + 0.10*name.
// config: large text leaves (SQL, scripts: multiline or > 40 chars) compare by token-set
// Jaccard, other leaves by leaf-entry Jaccard, blended 50/50 when text exists, so shared
// boilerplate does not drown the discriminating content. structure: Jaccard over already matched
// neighbours (anchors); with none on either side, in/out degree closeness. position: weak canvas
// closeness. name: deliberately small bigram Dice, a tie-breaker only.
// Formulas are kept in the Java operation order so the doubles are bit-identical.

import type { HopModel, StepModel, TransformationModel } from '../model/document.ts';
import { normalizeTrimmed } from '../normalize/normalizer.ts';
import { REFERENCES } from '../normalize/semantic-step.ts';
import type { XmlNode } from '../xml/xml-node.ts';

export const W_CONFIG = 0.58;
export const W_STRUCTURE = 0.21;
export const W_POSITION = 0.11;
export const W_NAME = 0.10;

/** A leaf value longer than this (or multiline) is treated as semantic text. */
const BIG_TEXT_THRESHOLD = 40;
const MAX_TOKENS_PER_LEAF = 500;
const TOKEN = /[A-Za-z0-9_$.{}]+/g;

export function similarityScore(b: StepModel, a: StepModel,
  beforeTrans: TransformationModel, afterTrans: TransformationModel,
  beforeAnchors: ReadonlyMap<string, string>, afterAnchors: ReadonlyMap<string, string>): number {
  const config = configSimilarity(requireXml(b), requireXml(a));
  const structure = structureSimilarity(b, a, beforeTrans, afterTrans, beforeAnchors, afterAnchors);
  const position = positionCloseness(b, a);
  const name = nameSimilarity(b.name, a.name);
  return W_CONFIG * config + W_STRUCTURE * structure + W_POSITION * position + W_NAME * name;
}

function requireXml(step: StepModel): XmlNode {
  if (step.xml === null) throw new TypeError('step has no XML');
  return step.xml;
}

// ------------------------------------------------------------------ config

interface Props {
  readonly boilerplate: Set<string>;
  readonly textTokens: Set<string>;
}

export function configSimilarity(stepB: XmlNode, stepA: XmlNode): number {
  const pb = props(stepB);
  const pa = props(stepA);
  const hasText = pb.textTokens.size > 0 || pa.textTokens.size > 0;
  const boiler = jaccard(pb.boilerplate, pa.boilerplate);
  if (!hasText) return boiler;
  const text = jaccard(pb.textTokens, pa.textTokens);
  return 0.5 * text + 0.5 * boiler;
}

function props(step: XmlNode): Props {
  const out: Props = { boilerplate: new Set(), textTokens: new Set() };
  for (const child of step.children) {
    if (child.name === 'name' || child.name === 'GUI' || child.name === 'description'
      || REFERENCES.has(child.name)) {
      continue;
    }
    collect(child, child.name, out);
  }
  return out;
}

function collect(node: XmlNode, relPath: string, out: Props): void {
  if (node.isSemanticallyEmpty()) return;
  if (node.isLeaf()) {
    const v = normalizeTrimmed(node.text);
    if (v.length > BIG_TEXT_THRESHOLD || v.includes('\n')) {
      let n = 0;
      for (const m of v.matchAll(TOKEN)) {
        if (n >= MAX_TOKENS_PER_LEAF) break;
        // Tokens are ASCII-only, so JS toLowerCase equals Java toLowerCase(Locale.ROOT).
        out.textTokens.add(relPath + '~' + m[0].toLowerCase());
        n++;
      }
    } else {
      out.boilerplate.add(relPath + '=' + v);
    }
    return;
  }
  const indices = new Map<string, number>();
  for (const c of node.children) {
    const i = (indices.get(c.name) ?? 0) + 1;
    indices.set(c.name, i);
    collect(c, relPath + '/' + c.name + '[' + i + ']', out);
  }
}

// --------------------------------------------------------------- structure

function structureSimilarity(b: StepModel, a: StepModel,
  beforeTrans: TransformationModel, afterTrans: TransformationModel,
  beforeAnchors: ReadonlyMap<string, string>, afterAnchors: ReadonlyMap<string, string>): number {
  const anchoredB = anchoredNeighbourTokens(b, beforeTrans.hops, beforeAnchors);
  const anchoredA = anchoredNeighbourTokens(a, afterTrans.hops, afterAnchors);
  if (anchoredB.size > 0 || anchoredA.size > 0) return jaccard(anchoredB, anchoredA);
  const [inB, outB] = degrees(b, beforeTrans.hops);
  const [inA, outA] = degrees(a, afterTrans.hops);
  const total = inB + inA + outB + outA;
  if (total === 0) return 1.0; // both isolated: same role
  return 1.0 - (Math.abs(inB - inA) + Math.abs(outB - outA)) / total;
}

function anchoredNeighbourTokens(step: StepModel, hops: readonly HopModel[],
  anchors: ReadonlyMap<string, string>): Set<string> {
  const tokens = new Set<string>();
  for (const hop of hops) {
    if (hop.from === step.name) {
      const anchor = anchors.get(hop.to);
      if (anchor !== undefined) tokens.add('out:' + anchor);
    }
    if (hop.to === step.name) {
      const anchor = anchors.get(hop.from);
      if (anchor !== undefined) tokens.add('in:' + anchor);
    }
  }
  return tokens;
}

function degrees(step: StepModel, hops: readonly HopModel[]): [number, number] {
  let inDegree = 0;
  let outDegree = 0;
  for (const hop of hops) {
    if (hop.to === step.name) inDegree++;
    if (hop.from === step.name) outDegree++;
  }
  return [inDegree, outDegree];
}

// ---------------------------------------------------------------- position

function positionCloseness(b: StepModel, a: StepModel): number {
  if (b.xloc === null || b.yloc === null || a.xloc === null || a.yloc === null) return 0.5;
  const dx = b.xloc - a.xloc;
  const dy = b.yloc - a.yloc;
  const dist = Math.sqrt(dx * dx + dy * dy);
  return Math.max(0.0, 1.0 - dist / 800.0);
}

// -------------------------------------------------------------------- name

/** Bigram Dice similarity on lowercased alphanumerics — a weak tie-breaking signal only. */
export function nameSimilarity(a: string | null, b: string | null): number {
  const ba = bigrams(a);
  const bb = bigrams(b);
  if (ba.size === 0 || bb.size === 0) return 0.0;
  let inter = 0;
  for (const x of ba) if (bb.has(x)) inter++;
  return 2.0 * inter / (ba.size + bb.size);
}

function bigrams(s: string | null): Set<string> {
  // Lowercase first, then keep ASCII alphanumerics, as Java does (e.g. U+212A KELVIN -> 'k').
  const clean = s === null ? '' : s.toLowerCase().replace(/[^a-z0-9]/g, '');
  const out = new Set<string>();
  if (clean.length < 2) {
    if (clean.length > 0) out.add(clean);
    return out;
  }
  for (let i = 0; i < clean.length - 1; i++) out.add(clean.substring(i, i + 2));
  return out;
}

// -------------------------------------------------------------------- util

function jaccard(a: ReadonlySet<string>, b: ReadonlySet<string>): number {
  if (a.size === 0 && b.size === 0) return 1.0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  const union = a.size + b.size - inter;
  return inter / union;
}
