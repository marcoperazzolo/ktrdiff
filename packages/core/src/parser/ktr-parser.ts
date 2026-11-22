// it.ktrdiff.core.parser.KtrParser — turns a <transformation> tree into a TransformationModel.
// Never executes anything: SQL, scripts, variables and referenced resources stay opaque text.

import {
  ConnectionModel, HopModel, NoteModel, StepModel, TransformationModel,
} from '../model/document.ts';
import { javaParseInt, javaTrim } from '../util/java.ts';
import { ParseError } from '../xml/parse-error.ts';
import type { XmlNode } from '../xml/xml-node.ts';

function intOrNull(s: string | null): number | null {
  if (s === null || s.length === 0) return null;
  return javaParseInt(javaTrim(s));
}

function parseStep(stepNode: XmlNode): StepModel {
  const gui = stepNode.child('GUI');
  const x = gui === null ? null : intOrNull(gui.childText('xloc'));
  const y = gui === null ? null : intOrNull(gui.childText('yloc'));
  return new StepModel(stepNode.childRawText('name'), stepNode.childText('type'), stepNode, x, y);
}

export function parseTransformationRoot(root: XmlNode): TransformationModel {
  if (root.name !== 'transformation') {
    throw new ParseError('unsupported_document',
      'Well-formed XML but the root element is <' + root.name + '>, not <transformation>');
  }
  const info = root.child('info');
  if (info === null) {
    throw new ParseError('invalid_ktr', '<transformation> has no <info> section — not a valid KTR document');
  }

  const steps: StepModel[] = [];
  const seen = new Set<string>();
  // Java collects duplicates in a HashSet, whose iteration order reaches the message; first
  // occurrence order is used instead (D7 in docs/parity.md, identical for a single duplicate).
  const duplicates = new Set<string>();
  for (const stepNode of root.childrenNamed('step')) {
    const step = parseStep(stepNode);
    if (seen.has(step.name)) duplicates.add(step.name);
    else seen.add(step.name);
    steps.push(step);
  }
  if (duplicates.size > 0) {
    throw new ParseError('duplicate_step_names', 'Duplicate step names: ' + [...duplicates].join(', '));
  }

  const hops: HopModel[] = [];
  const order = root.child('order');
  if (order !== null) {
    for (const hop of order.childrenNamed('hop')) {
      const enabled = hop.childText('enabled');
      hops.push(new HopModel(hop.childText('from'), hop.childText('to'),
        enabled === null || enabled === 'Y' || enabled === 'y'));
    }
  }

  const notes: NoteModel[] = [];
  const notepads = root.child('notepads');
  if (notepads !== null) {
    for (const notepad of notepads.childrenNamed('notepad')) {
      notes.push(new NoteModel(
        notepad.childRawText('note'),
        intOrNull(notepad.childText('xloc')),
        intOrNull(notepad.childText('yloc')),
        intOrNull(notepad.childText('width')),
        // Pentaho writes the misspelled tag <heigth>; accept both spellings
        intOrNull(notepad.childText('heigth') ?? notepad.childText('height')),
        notepad));
    }
  }

  const connections: ConnectionModel[] = [];
  for (const conn of root.childrenNamed('connection')) {
    connections.push(new ConnectionModel(conn.childText('name'), conn));
  }

  return new TransformationModel(info.childText('name'), info.childRawText('description'), info,
    connections, steps, hops, notes, root);
}
