// wordDiff (readable SQL/script changes) and the whole texts carried by body changes (D8).
import { describe, expect, it } from 'vitest';
import { alignLines, compareDocuments, defaultConfig, isTextBodyChange, renderHtml, renderText, wordDiff } from '../src/index.ts';
import type { DocumentInput, WordPart } from '../src/index.ts';

const join = (parts: WordPart[], keep: 'removed' | 'added') =>
  parts.filter((p) => p.op === 'equal' || p.op === keep).map((p) => p.text).join('');

describe('wordDiff', () => {
  it('marks only the changed words and rebuilds both texts', () => {
    const before = 'SELECT a, b FROM t WHERE x = 1';
    const after = 'SELECT a, c FROM t WHERE x = 1 AND y IS NULL';
    const parts = wordDiff(before, after);
    expect(parts.filter((p) => p.op !== 'equal')).toEqual([
      { op: 'removed', text: 'b' }, { op: 'added', text: 'c' }, { op: 'added', text: ' AND y IS NULL' },
    ]);
    expect(join(parts, 'removed')).toBe(before);
    expect(join(parts, 'added')).toBe(after);
  });

  it('handles empty sides and identical texts', () => {
    expect(wordDiff('', 'x = 1')).toEqual([{ op: 'added', text: 'x = 1' }]);
    expect(wordDiff('x', '')).toEqual([{ op: 'removed', text: 'x' }]);
    expect(wordDiff('same text', 'same text')).toEqual([{ op: 'equal', text: 'same text' }]);
  });
});

describe('alignLines', () => {
  it('faces unchanged lines and pairs a changed block line by line', () => {
    const rows = alignLines('SELECT a\nFROM t\nORDER BY a', 'SELECT a\nFROM t2\nWHERE x = 1\nORDER BY a');
    expect(rows).toEqual([
      { kind: 'equal', before: 'SELECT a', after: 'SELECT a' },
      { kind: 'changed', before: 'FROM t', after: 'FROM t2' },
      { kind: 'added', before: null, after: 'WHERE x = 1' },
      { kind: 'equal', before: 'ORDER BY a', after: 'ORDER BY a' },
    ]);
  });

  it('keeps every line of both texts, in order', () => {
    const before = 'a\nb\nc\nd', after = 'a\nc\nd\ne';
    const rows = alignLines(before, after);
    expect(rows.map((r) => r.before).filter((l) => l !== null).join('\n')).toBe(before);
    expect(rows.map((r) => r.after).filter((l) => l !== null).join('\n')).toBe(after);
    expect(rows.find((r) => r.before === 'b')?.kind).toBe('removed');
  });
});

const ktr = (sql: string): DocumentInput => ({
  name: 't.ktr',
  content: `<transformation><info><name>t</name></info><step><name>Read</name><type>TableInput</type><sql>${sql}</sql></step></transformation>`,
});

describe('SQL body changes (D8)', () => {
  const config = { ...defaultConfig(), mode: 'advanced' as const };
  const changeSet = compareDocuments(ktr('SELECT a FROM t'), ktr('SELECT a FROM t WHERE b = 1'), config);
  const sql = changeSet.changes.find((c) => c.kind === 'sql_changed')!;

  it('carry the whole before/after query next to the changed lines', () => {
    expect(isTextBodyChange(sql)).toBe(true);
    expect([sql.before, sql.after]).toEqual(['SELECT a FROM t', 'SELECT a FROM t WHERE b = 1']);
    expect(sql.addedFragments).toEqual(['SELECT a FROM t WHERE b = 1']);
  });

  it('keep the reports printing the changed lines only, as the Java engine did', () => {
    expect(renderHtml(changeSet, config)).not.toContain('<div class="vals">');
    expect(renderText(changeSet, config)).not.toContain('Query:');
  });
});
