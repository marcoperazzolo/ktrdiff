// it.ktrdiff.core.xml.XmlNode — immutable element tree used by the whole engine.
// Keeps raw text and document order, and its own XML path (e.g. /transformation/step[2]/name)
// so every change can point back to its source. Path indexes are 1-based among same-named siblings.

import { javaTrim } from '../util/java.ts';

export class XmlNode {
  readonly name: string;
  /** Concatenated direct text (text and CDATA), never null, may be "". */
  readonly text: string;
  readonly attributes: ReadonlyMap<string, string>;
  readonly children: readonly XmlNode[];
  readonly path: string;

  constructor(name: string, text: string | null, attributes: ReadonlyMap<string, string>,
    children: readonly XmlNode[], path: string) {
    this.name = name;
    this.text = text ?? '';
    this.attributes = attributes;
    this.children = children;
    this.path = path;
  }

  /** Text without surrounding whitespace (Java trim) — used for identity (names, references). */
  trimmedText(): string {
    return javaTrim(this.text);
  }

  isLeaf(): boolean {
    return this.children.length === 0;
  }

  /** An element with no attributes, no children and blank text carries no information. */
  isSemanticallyEmpty(): boolean {
    if (this.attributes.size > 0) return false;
    if (this.children.length === 0) return javaTrim(this.text).length === 0;
    if (javaTrim(this.text).length > 0) return false;
    for (const c of this.children) {
      if (!c.isSemanticallyEmpty()) return false;
    }
    return true;
  }

  /** First child with the given element name, or null. */
  child(childName: string): XmlNode | null {
    for (const c of this.children) {
      if (c.name === childName) return c;
    }
    return null;
  }

  /** All children with the given element name, in document order. */
  childrenNamed(childName: string): XmlNode[] {
    return this.children.filter((c) => c.name === childName);
  }

  /** Trimmed text of the first child with the given name, or null when the child is absent. */
  childText(childName: string): string | null {
    const c = this.child(childName);
    return c === null ? null : c.trimmedText();
  }

  /** Raw (untrimmed) text of the first child with the given name, or null when absent. */
  childRawText(childName: string): string | null {
    const c = this.child(childName);
    return c === null ? null : c.text;
  }

  toString(): string {
    return `<${this.name}> (${this.children.length} children)`;
  }
}
