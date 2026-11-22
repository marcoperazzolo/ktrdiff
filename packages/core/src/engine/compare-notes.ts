// DiffEngine.compareNotes: notes pair by identical normalized text first, leftovers by document
// order (text edits); text, position, size and style are reported as separate changes.

import { textDiff } from '../adapters/text-diff.ts';
import { change, type Change } from '../model/change.ts';
import type { NoteModel, TransformationModel } from '../model/document.ts';
import { normalizeText, sameText } from '../normalize/normalizer.ts';
import { javaTrim } from '../util/java.ts';
import type { XmlNode } from '../xml/xml-node.ts';
import { XmlFallback } from './xml-fallback.ts';

const STYLE_TAGS = ['fontname', 'fontsize', 'fontbold', 'fontitalic', 'drawshadow',
  'fontcolorred', 'fontcolorgreen', 'fontcolorblue', 'backgroundcolorred', 'backgroundcolorgreen',
  'backgroundcolorblue', 'bordercolorred', 'bordercolorgreen', 'bordercolorblue'] as const;
const NOTE_HANDLED: ReadonlySet<string> = new Set(['note', 'xloc', 'yloc', 'width', 'heigth', 'height']);

function noteXml(n: NoteModel): XmlNode {
  if (n.xml === null) throw new Error('note without XML');
  return n.xml;
}

export function compareNotes(before: TransformationModel, after: TransformationModel, changes: Change[]): void {
  const b = [...before.notes];
  const a = [...after.notes];

  // First pass: pair notes with identical normalized text.
  for (const nb of [...b]) {
    let found: NoteModel | null = null;
    for (const na of a) {
      if (sameText(javaTrim(nb.text), javaTrim(na.text))) {
        found = na;
        break;
      }
    }
    if (found !== null) {
      // List.remove(Object) with identity equality: the first occurrence.
      b.splice(b.indexOf(nb), 1);
      a.splice(a.indexOf(found), 1);
      compareNotePair(nb, found, changes, false);
    }
  }
  // Second pass: leftover notes pair by document order -> text edits.
  const common = Math.min(b.length, a.length);
  for (let i = 0; i < common; i++) compareNotePair(b[i]!, a[i]!, changes, true);
  for (let i = common; i < b.length; i++) {
    const n = b[i]!;
    changes.push(change('note_removed', 'metadata', 'note')
      .section('notes').property('text')
      .before(normalizeText(n.text)).after(null)
      .sourceXmlPath(noteXml(n).path)
      .build());
  }
  for (let i = common; i < a.length; i++) {
    const n = a[i]!;
    changes.push(change('note_added', 'metadata', 'note')
      .section('notes').property('text')
      .before(null).after(normalizeText(n.text))
      .sourceXmlPath(noteXml(n).path)
      .build());
  }
}

function compareNotePair(nb: NoteModel, na: NoteModel, changes: Change[], textDiffers: boolean): void {
  const firstNoteChange = changes.length;
  const bx = noteXml(nb);
  const ax = noteXml(na);
  if (textDiffers) {
    const diff = textDiff(nb.text, na.text);
    changes.push(change('note_changed', 'metadata', 'note')
      .section('notes').property('text')
      .field(na.label())
      .before(normalizeText(nb.text))
      .after(normalizeText(na.text))
      .addedFragments(diff.addedLines)
      .removedFragments(diff.removedLines)
      .rawDiff(diff.unified)
      .sourceXmlPath(ax.path)
      .build());
  }
  if (nb.xloc !== na.xloc || nb.yloc !== na.yloc) {
    changes.push(change('note_moved', 'layout', 'note')
      .section('notes').property('position')
      .field(na.label())
      .before(nb.positionString()).after(na.positionString())
      .sourceXmlPath(ax.path)
      .build());
  }
  if (nb.width !== na.width || nb.height !== na.height) {
    // Java string concatenation prints a null Integer as "null", like String(null).
    changes.push(change('note_changed', 'layout', 'note')
      .section('notes').property('size')
      .field(na.label())
      .before(String(nb.width) + 'x' + String(nb.height))
      .after(String(na.width) + 'x' + String(na.height))
      .sourceXmlPath(ax.path)
      .build());
  }
  for (const tag of STYLE_TAGS) {
    const b = bx.childText(tag);
    const a = ax.childText(tag);
    if (b !== a) {
      // Values differ, so at least one side has the element.
      const node = (ax.child(tag) ?? bx.child(tag))!;
      changes.push(change('note_changed', 'layout', 'note')
        .section('notes').property(tag).field(na.label()).before(b).after(a)
        .sourceXmlPath(node.path).build());
    }
  }
  new XmlFallback(changes.slice(firstNoteChange), changes, null, null).compare(bx, ax, NOTE_HANDLED);
}
