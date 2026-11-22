// it.ktrdiff.core.xml.SecureXml — bounded XML loading into the XmlNode tree.
// Documents are data only: nothing is resolved, executed or fetched (see tokenizer.ts).
// Check order and tree conversion replicate the Java class; the element-count limit is new (D3).

import { compareUtf16, javaTrim } from '../util/java.ts';
import { decodeUtf8 } from '../util/utf8.ts';
import { ParseError } from './parse-error.ts';
import { tokenize } from './tokenizer.ts';
import { XmlNode } from './xml-node.ts';

export const DEFAULT_MAX_BYTES = 50 * 1024 * 1024;
export const DEFAULT_MAX_DEPTH = 200;
export const DEFAULT_MAX_ELEMENTS = 1_000_000;

export interface XmlLimits {
  maxBytes?: number;
  maxDepth?: number;
  maxElements?: number;
}

interface Frame {
  name: string;
  path: string;
  attributes: ReadonlyMap<string, string>;
  text: string[];
  children: XmlNode[];
  /** Per-tag counters for the 1-based path indexes of the children. */
  nameCounts: Map<string, number>;
}

/** `SecureXml.parseFile`: byte-size check first, then UTF-8 decoding (BOM kept) and parsing. */
export function parseXmlBytes(bytes: Uint8Array, limits: XmlLimits = {}): XmlNode {
  const maxBytes = limits.maxBytes ?? DEFAULT_MAX_BYTES;
  if (bytes.length > maxBytes) {
    throw new ParseError('file_too_large', `File exceeds the size limit (${bytes.length} > ${maxBytes} bytes)`);
  }
  return parseXmlString(decodeUtf8(bytes), limits);
}

/** `SecureXml.parseString`. */
export function parseXmlString(content: string, limits: XmlLimits = {}): XmlNode {
  const maxBytes = limits.maxBytes ?? DEFAULT_MAX_BYTES;
  const maxDepth = limits.maxDepth ?? DEFAULT_MAX_DEPTH;
  const maxElements = limits.maxElements ?? DEFAULT_MAX_ELEMENTS;
  if (javaTrim(content).length === 0) {
    throw new ParseError('invalid_xml', 'Empty document');
  }
  if (content.length > maxBytes) {
    throw new ParseError('file_too_large',
      `Document exceeds the size limit (${content.length} > ${maxBytes} chars)`);
  }

  const stack: Frame[] = [];
  // A holder object: assignments inside the handler closures are invisible to narrowing.
  const result: { root: XmlNode | null } = { root: null };
  let elements = 0;
  tokenize(content, {
    startElement(name, attributeList) {
      // Java checks the depth while converting the finished DOM; checking inline gives the
      // same verdict (both are invalid_xml) without building an over-deep tree first.
      if (stack.length + 1 > maxDepth) {
        throw new ParseError('invalid_xml', `Document exceeds the maximum element depth of ${maxDepth}`);
      }
      if (++elements > maxElements) {
        throw new ParseError('invalid_xml', `Document exceeds the maximum number of elements (${maxElements})`);
      }
      const parent = stack[stack.length - 1];
      let path: string;
      if (parent === undefined) {
        path = `/${name}`;
      } else {
        const index = (parent.nameCounts.get(name) ?? 0) + 1;
        parent.nameCounts.set(name, index);
        path = `${parent.path}/${name}[${index}]`;
      }
      // Xerces keeps attributes sorted by name (NamedNodeMap), not in document order.
      const sorted = [...attributeList].sort((a, b) => compareUtf16(a[0], b[0]));
      stack.push({ name, path, attributes: new Map(sorted), text: [], children: [], nameCounts: new Map() });
    },
    text(value) {
      stack[stack.length - 1]!.text.push(value);
    },
    endElement() {
      const frame = stack.pop()!;
      const text = frame.text.join('');
      // Whitespace-only text interleaved with child elements is indentation, not content.
      const textValue = frame.children.length === 0 ? text : (javaTrim(text).length === 0 ? '' : text);
      const node = new XmlNode(frame.name, textValue, frame.attributes, frame.children, frame.path);
      const parent = stack[stack.length - 1];
      if (parent === undefined) result.root = node;
      else parent.children.push(node);
    },
  });
  if (result.root === null) throw new ParseError('invalid_xml', 'Document has no root element');
  return result.root;
}
