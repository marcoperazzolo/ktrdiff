// it.ktrdiff.core.parser.PentahoDocumentParser — projects KTR, KJB and KDB trees into the shared
// transformation model while keeping the original XML paths. Referenced jobs, transformations and
// connections are never loaded or executed; references remain opaque text.

import type { TransformationModel } from '../model/document.ts';
import { javaTrim } from '../util/java.ts';
import { ParseError } from '../xml/parse-error.ts';
import { XmlNode } from '../xml/xml-node.ts';
import { parseTransformationRoot } from './ktr-parser.ts';

const NO_ATTRIBUTES: ReadonlyMap<string, string> = new Map();
const JOB_NON_INFO = new Set(['entries', 'hops', 'notepads', 'connection']);
const ENTRY_GUI = new Set(['xloc', 'yloc', 'draw']);

function node(name: string, text: string | null, children: readonly XmlNode[], path: string): XmlNode {
  return new XmlNode(name, text, NO_ATTRIBUTES, children, path);
}

/** Job entries are identified by name plus copy number, like Spoon shows them. */
function entryIdentity(name: string, nr: string | null): string {
  return nr === null || nr.length === 0 || nr === '0' ? name : name + ' [copy ' + nr + ']';
}

export function parseDocumentRoot(root: XmlNode): TransformationModel {
  if (root.name === 'transformation') return parseTransformationRoot(root);
  const children: XmlNode[] = [];
  if (root.name === 'connection') {
    children.push(node('info', '', [node('name', root.childText('name'), [], root.path + '/name')], root.path));
    children.push(root);
  } else if (root.name === 'job') {
    const info: XmlNode[] = [];
    for (const child of root.children) {
      if (JOB_NON_INFO.has(child.name)) continue;
      info.push(child);
    }
    children.push(node('info', '', info, root.path));
    children.push(...root.childrenNamed('connection'));
    children.push(...root.childrenNamed('notepads'));
    for (const entries of root.childrenNamed('entries')) {
      if (entries.attributes.size > 0 || javaTrim(entries.text).length > 0) {
        children.push(new XmlNode('job_entry_container', entries.text, entries.attributes, [], entries.path));
      }
      for (const entry of entries.children) {
        if (entry.name !== 'entry') {
          children.push(entry);
          continue;
        }
        const properties: XmlNode[] = [];
        const gui: XmlNode[] = [];
        for (const prop of entry.children) {
          if (ENTRY_GUI.has(prop.name)) gui.push(prop);
          else if (prop.name === 'name') {
            properties.push(node('name', entryIdentity(prop.trimmedText(), entry.childText('nr')), [], prop.path));
          } else properties.push(prop);
        }
        properties.push(node('GUI', '', gui, entry.path));
        children.push(new XmlNode('step', entry.text, entry.attributes, properties, entry.path));
      }
    }
    for (const hops of root.childrenNamed('hops')) {
      const projected: XmlNode[] = [];
      for (const hop of hops.children) {
        if (hop.name !== 'hop') {
          projected.push(hop);
          continue;
        }
        const props: XmlNode[] = [];
        for (const prop of hop.children) {
          if (prop.name === 'from' || prop.name === 'to') {
            props.push(node(prop.name, entryIdentity(prop.trimmedText(), hop.childText(prop.name + '_nr')), [], prop.path));
          } else props.push(prop);
        }
        projected.push(new XmlNode('hop', hop.text, hop.attributes, props, hop.path));
      }
      children.push(new XmlNode('order', hops.text, hops.attributes, projected, hops.path));
    }
  } else {
    throw new ParseError('unsupported_document', 'Expected Pentaho <transformation>, <job> or <connection> XML');
  }
  return parseTransformationRoot(new XmlNode('transformation', root.text,
    root.name === 'connection' ? NO_ATTRIBUTES : root.attributes, children, root.path));
}
