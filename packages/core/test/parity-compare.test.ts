import { describe, expect, it } from 'vitest';
import {
  compareJson, compareOutput, compareText, formatDifferences, type Json,
} from '../../../parity/lib/compare.ts';

describe('parity compare', () => {
  it('reports a changed number with its path', () => {
    const diffs = compareJson({ a: { b: [1, 0.7] } }, { a: { b: [1, 0.70000001] } });
    expect(diffs).toEqual([{ path: '$.a.b[1]', kind: 'changed', expected: 0.7, actual: 0.70000001 }]);
  });

  it('reports a reordered array element by element', () => {
    const diffs = compareJson({ list: ['x', 'y'] }, { list: ['y', 'x'] });
    expect(diffs.map((d) => d.path)).toEqual(['$.list[0]', '$.list[1]']);
  });

  it('reports extra, missing and type-changed keys', () => {
    const diffs = compareJson({ a: 1, b: null, 'odd key': 1 } as Json, { a: '1', c: true, 'odd key': 1 } as Json);
    expect(diffs).toEqual([
      { path: '$.a', kind: 'type', expected: 1, actual: '1' },
      { path: '$.b', kind: 'missing', expected: null },
      { path: '$.c', kind: 'extra', actual: true },
    ]);
  });

  it('reports array length differences', () => {
    expect(compareJson([1, 2], [1, 2, 3])).toEqual([{ path: '$', kind: 'length', expected: 2, actual: 3 }]);
  });

  it('treats equal documents as equal regardless of key order and whitespace (D5)', () => {
    expect(compareOutput('advanced.json', '{ "a" : 1, "b" : [ ] }', '{"b":[],"a":1}')).toEqual([]);
  });

  it('applies D1 only to invalid_xml error messages', () => {
    const expected = JSON.stringify({ errors: [{ code: 'invalid_xml', message: 'Xerces', side: 'after' }] });
    const reworded = JSON.stringify({ errors: [{ code: 'invalid_xml', message: 'ours', side: 'after' }] });
    const otherSide = JSON.stringify({ errors: [{ code: 'invalid_xml', message: 'ours', side: 'before' }] });
    expect(compareOutput('advanced.json', expected, reworded)).toEqual([]);
    expect(compareOutput('advanced.json', expected, otherSide).map((d) => d.path)).toEqual(['$.errors[0].side']);
    const ktr = JSON.stringify({ errors: [{ code: 'invalid_ktr', message: 'a', side: 'after' }] });
    expect(compareOutput('advanced.json', ktr, ktr.replace('"a"', '"b"'))).toHaveLength(1);
  });

  it('applies D2 only to directory outputs', () => {
    const java = JSON.stringify({ summary: { added: 1 }, files: [{ status: 'modified' }] });
    const ts = JSON.stringify({ summary: { added: 1 }, files: [{ status: 'modified', summary: { total: 1 } }] });
    expect(compareOutput('directory.quick.json', java, ts)).toEqual([]);
    expect(compareOutput('advanced.json', java, ts)).toHaveLength(1);
  });

  it('compares text byte for byte and reports the first differing line', () => {
    expect(compareText('a\nb\n', 'a\nb\n')).toEqual([]);
    expect(compareText('a\nb\n', 'a\nB\n')).toEqual([{ path: 'line 2', kind: 'changed', expected: 'b', actual: 'B' }]);
    expect(compareOutput('validate.txt', 'INVALID [invalid_xml]: Xerces words\n', 'INVALID [invalid_xml]: ours\n')).toEqual([]);
  });

  it('applies D1 to text and HTML report messages but keeps the side compared', () => {
    const txt = (side: string, msg: string): string => `ERRORS\n  [invalid_xml] (${side}) ${msg}\n`;
    expect(compareOutput('advanced.txt', txt('after', 'Xerces.'), txt('after', 'ours'))).toEqual([]);
    expect(compareOutput('quick.txt', txt('after', 'Xerces.'), txt('before', 'ours'))).toHaveLength(1);
    const other = '  [invalid_ktr] (after) a\n';
    expect(compareOutput('advanced.txt', other, other.replace(' a', ' b'))).toHaveLength(1);
    const html = (side: string, msg: string): string =>
      `<li><code>invalid_xml</code> <em>(${side})</em> ${msg}</li>`;
    expect(compareOutput('advanced.html', html('after', 'Xerces.'), html('after', 'ours'))).toEqual([]);
    expect(compareOutput('advanced.html', html('after', 'Xerces.'), html('before', 'ours'))).toHaveLength(1);
  });

  it('never prints values in private reports', () => {
    const diffs = compareJson({ name: 'secret step' }, { name: 'other' });
    expect(formatDifferences('case', 'advanced.json', diffs, false)).not.toContain('secret');
    expect(formatDifferences('case', 'advanced.json', diffs, true)).toContain('secret step');
  });
});
