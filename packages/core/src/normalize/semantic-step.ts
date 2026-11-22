// it.ktrdiff.core.normalize.SemanticStep — matching-only projection of a step. Detection
// always works on the unmodified XML; this signature only decides which steps correspond.

import { canonicalStepType } from '../match/step-type-aliases.ts';
import type { StepModel } from '../model/document.ts';
import { compareUtf16 } from '../util/java.ts';
import { XmlNode } from '../xml/xml-node.ts';
import { canonical } from './normalizer.ts';

/** Elements whose text names another step: replaced by its anchor so renames do not leak in. */
export const REFERENCES: ReadonlySet<string> = new Set(['step1', 'step2', 'send_true_to', 'send_false_to',
  'main', 'target_step', 'default_target_step', 'stepname']);

const ROOT_EXCLUDED: ReadonlySet<string> = new Set(['name', 'GUI', 'description']);

export function semanticSignature(step: StepModel, anchors: ReadonlyMap<string, string>): string {
  if (step.xml === null) throw new TypeError('step has no XML');
  return canonical(project(step.xml, anchors, true), null);
}

function project(node: XmlNode, anchors: ReadonlyMap<string, string>, root: boolean): XmlNode {
  const children: XmlNode[] = [];
  const names = new Set<string>();
  let unique = true;
  for (const child of node.children) {
    if (root && ROOT_EXCLUDED.has(child.name)) continue;
    if (child.isSemanticallyEmpty()) continue;
    if (names.has(child.name)) unique = false;
    else names.add(child.name);
    children.push(project(child, anchors, false));
  }
  // Property order is irrelevant; repeated elements (fields, keys, conditions) retain order.
  // Array.prototype.sort is stable like List.sort.
  if (unique) children.sort((a, b) => compareUtf16(a.name, b.name));
  let text = node.text;
  if (node.name === 'type' && node.isLeaf()) text = canonicalStepType(node.trimmedText());
  if (REFERENCES.has(node.name) && node.isLeaf()) text = anchors.get(node.trimmedText()) ?? node.trimmedText();
  return new XmlNode(node.name, text, node.attributes, children, node.path);
}
