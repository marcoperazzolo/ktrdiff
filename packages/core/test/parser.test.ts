// Port of KtrParserTest plus parse-level checks of the KJB/KDB projection (PentahoDocumentParser);
// the engine-level PentahoDocumentsTest cases are ported with the engine (F3b).
import { describe, expect, it } from 'vitest';
import { parseDocument, parseTransformation, ParseError, type DocumentInput } from '../src/index.ts';
import { encodeUtf8 } from '../src/util/utf8.ts';
import * as K from './support/ktrs.ts';

const doc = (content: string): DocumentInput => ({ name: 'test.ktr', content });

function parseErrorCode(fn: () => unknown): string {
  try {
    fn();
  } catch (e) {
    if (e instanceof ParseError) return e.code;
    throw e;
  }
  throw new Error('expected a ParseError');
}

describe('KtrParser', () => {
  it('parsesStepsHopsAndNotes', () => {
    const ktr = K.transformationWithNotes('demo',
      K.notepads(K.notepad('hello', 10, 20)),
      K.order(K.hop('A', 'B')) + K.dummyStep('A', 100, 100) + K.dummyStep('B', 200, 100));
    const t = parseTransformation(doc(ktr));
    expect(t.name).toBe('demo');
    expect(t.steps).toHaveLength(2);
    expect(t.hops).toHaveLength(1);
    expect(t.hops[0]!.from).toBe('A');
    expect(t.notes).toHaveLength(1);
    expect(t.notes[0]!.text).toBe('hello');
    expect(t.notes[0]!.height).toBe(30); // Pentaho's misspelled <heigth>
  });

  it('trimsStepNamesAndHopReferences', () => {
    // step names with trailing newlines exist in real KTRs (sql-flow seed)
    const ktr = K.transformation('demo',
      K.order('    <hop><from>Read Rows\n</from><to>Out</to><enabled>Y</enabled></hop>\n')
        + K.dummyStep('Read Rows\n', 0, 0) + K.dummyStep('Out', 10, 0));
    const t = parseTransformation(doc(ktr));
    expect(t.stepByName('Read Rows')).not.toBeNull();
    expect(t.hops[0]!.from).toBe('Read Rows');
    expect(t.stepByName('Read Rows')!.originalName).toContain('\n');
  });

  it('duplicateStepNamesAreAControlledError', () => {
    const ktr = K.transformation('demo', K.dummyStep('Same', 0, 0) + K.dummyStep('Same', 10, 0));
    expect(parseErrorCode(() => parseTransformation(doc(ktr)))).toBe('duplicate_step_names');
  });

  it('lists several duplicated step names in first-duplicate document order (D7)', () => {
    const ktr = K.transformation('demo', K.dummyStep('Zeta', 0, 0) + K.dummyStep('Alpha', 10, 0)
      + K.dummyStep('Zeta', 20, 0) + K.dummyStep('Alpha', 30, 0) + K.dummyStep('Zeta', 40, 0));
    let message = '';
    try {
      parseTransformation(doc(ktr));
    } catch (e) {
      if (!(e instanceof ParseError)) throw e;
      message = e.message;
    }
    expect(message).toBe('Duplicate step names: Zeta, Alpha');
  });

  it('nonTransformationRootIsUnsupported', () => {
    expect(parseErrorCode(() => parseTransformation(doc('<job><info/></job>')))).toBe('unsupported_document');
  });

  it('transformationWithoutInfoIsInvalidKtr', () => {
    expect(parseErrorCode(() => parseTransformation(doc('<transformation><order/></transformation>'))))
      .toBe('invalid_ktr');
  });

  it('reads hop enabled flags case-insensitively and positions leniently', () => {
    const ktr = K.transformation('demo',
      K.order('<hop><from>A</from><to>B</to><enabled>n</enabled></hop>',
        '<hop><from>B</from><to>A</to><enabled>y</enabled></hop>', '<hop><from>A</from><to>A</to></hop>')
      + K.step('A', 'Dummy', 0, 0, '').replace('<xloc>0</xloc>', '<xloc> 12 </xloc>')
      + K.step('B', 'Dummy', 0, 0, '').replace('<xloc>0</xloc>', '<xloc>x</xloc>'));
    const t = parseTransformation(doc(ktr));
    expect(t.hops.map((h) => h.enabled)).toEqual([false, true, true]);
    expect(t.steps.map((s) => s.positionString())).toEqual(['12,0', '?,0']);
  });

  it('lists every duplicated name once in first-occurrence order (B1)', () => {
    const ktr = K.transformation('demo', ['B', 'A', 'B', 'A', 'B'].map((n) => K.dummyStep(n, 0, 0)).join(''));
    expect(() => parseTransformation(doc(ktr))).toThrow('Duplicate step names: B, A');
  });
});

describe('PentahoDocumentParser projection', () => {
  const job = '<job><name>Demo</name><description>d</description>'
    + '<entries><entry><name>Start</name><type>SPECIAL</type><nr>0</nr><xloc>1</xloc><yloc>2</yloc><draw>Y</draw></entry>'
    + '<entry><name>Run</name><type>TRANS</type><nr>1</nr><filename>${DIR}/child.ktr</filename><xloc>30</xloc><yloc>40</yloc></entry>'
    + '</entries><hops><hop><from>Start</from><to>Run</to><from_nr>0</from_nr><to_nr>1</to_nr>'
    + '<enabled>N</enabled><evaluation>Y</evaluation></hop></hops></job>';

  it('projects job entries to steps and keeps their original paths', () => {
    const t = parseDocument(doc(job));
    expect(t.documentType()).toBe('job');
    expect(t.name).toBe('Demo');
    expect(t.description).toBe('d');
    expect(t.steps.map((s) => s.name)).toEqual(['Start', 'Run [copy 1]']);
    expect(t.steps.map((s) => s.type)).toEqual(['SPECIAL', 'TRANS']);
    expect(t.steps.map((s) => s.positionString())).toEqual(['1,2', '30,40']);
    expect(t.steps[1]!.xml!.path).toBe('/job/entries[1]/entry[2]');
    expect(t.steps[1]!.xml!.child('filename')!.path).toBe('/job/entries[1]/entry[2]/filename[1]');
    expect(t.hops.map((h) => h.toString())).toEqual(['Start -> Run [copy 1] (disabled)']);
    expect(t.info!.children.map((c) => c.name)).toEqual(['name', 'description']);
  });

  it('projects a standalone KDB connection', () => {
    const t = parseDocument(doc('<connection><name> DB </name><server>h</server></connection>'));
    expect(t.documentType()).toBe('connection');
    expect(t.name).toBe('DB');
    expect(t.connections.map((c) => c.name)).toEqual(['DB']);
    expect(t.connections[0]!.xml!.path).toBe('/connection');
    expect(t.steps).toHaveLength(0);
  });

  it('delegates transformations and rejects other roots', () => {
    expect(parseDocument(doc(K.transformation('T', K.dummyStep('A', 0, 0)))).documentType()).toBe('transformation');
    expect(parseErrorCode(() => parseDocument(doc('<repository/>')))).toBe('unsupported_document');
  });

  it('parses byte input as UTF-8 and applies the size limit', () => {
    const bytes = encodeUtf8(K.transformation('Café', ''));
    expect(parseDocument({ name: 'a.ktr', content: bytes }).name).toBe('Café');
    expect(parseErrorCode(() => parseDocument({ name: 'a.ktr', content: bytes }, { maxFileBytes: 10 })))
      .toBe('file_too_large');
  });
});
