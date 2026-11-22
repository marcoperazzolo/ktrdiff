// Port of DirectoryDiffEngineTest (it.ktrdiff.core.engine). Each title starts with the Java method name.
import { describe, expect, it } from 'vitest';
import {
  advancedConfig, compareDirectories, defaultConfig, DirectoryInputError, normalizePath, renderDirectoryJson,
} from '../src/index.ts';
import type { DocumentInput } from '../src/index.ts';
import * as K from './support/ktrs.ts';

function ktr(path: string, name: string, x: number): DocumentInput {
  return { name: path, content: K.transformation(name, K.dummyStep('A', x, 0)) };
}

function job(name: string, x: number, filename: string): string {
  return '<job><name>Demo</name><entries><entry><name>Start</name><type>SPECIAL</type><nr>0</nr><start>Y</start><xloc>0</xloc><yloc>0</yloc></entry>'
    + '<entry><name>' + name + '</name><type>TRANS</type><nr>0</nr><filename>' + filename + '</filename><xloc>' + x + '</xloc><yloc>10</yloc></entry>'
    + '</entries><hops><hop><from>Start</from><to>' + name + '</to><enabled>Y</enabled><evaluation>Y</evaluation><unconditional>N</unconditional></hop></hops></job>';
}

const sorted = (xs: readonly string[]): string[] => [...xs].sort();

describe('DirectoryDiffEngine', () => {
  it('pairsRelativePathsThenUniqueNamesThenSemanticFileRenames', () => {
    const b = [ktr('same.ktr', 'T', 0), ktr('old/move.ktr', 'T', 1), ktr('rename.ktr', 'Old', 2)];
    const a = [ktr('same.ktr', 'T', 5), ktr('new/move.ktr', 'T', 3), ktr('renamed.ktr', 'New', 4)];
    const r = compareDirectories(b, a, advancedConfig());
    expect(r.files).toHaveLength(3);
    expect(r.files.some((f) => f.status === 'added' || f.status === 'removed')).toBe(false);
    expect(sorted(r.files.map((f) => f.method))).toEqual(sorted(['path', 'basename', 'semantic']));
    expect(JSON.parse(renderDirectoryJson(r, advancedConfig())).scope).toBe('directory');
  });

  it('addedAndRemovedJobsAndConnectionsAreValidDocumentsNotXmlErrors', () => {
    const r = compareDirectories(
      [{ name: 'old.kdb', content: '<connection><name>DB</name><server>one</server></connection>' }],
      [{ name: 'new.kjb', content: job('X', 1, 'child.ktr') }], advancedConfig());
    expect(sorted(r.files.map((f) => f.status))).toEqual(['added', 'removed']);
    for (const f of r.files) expect(f.changeSet.errors).toHaveLength(0);
  });

  it('duplicatesAreNotGuessedAndMalformedFilesRemainVisible', () => {
    const r = compareDirectories([ktr('old.ktr', 'A', 0)],
      [ktr('one.ktr', 'A', 1), ktr('two.ktr', 'A', 2), { name: 'bad.kjb', content: 'broken' }], advancedConfig());
    expect(r.files).toHaveLength(4);
    expect(r.warnings.some((w) => w.code === 'ambiguous_file_rename')).toBe(true);
    expect(r.files.some((f) => f.changeSet.errors.length > 0)).toBe(true);
  });

  it('rejectsTraversalDuplicateNormalizedPathsAndAggregateLimits', () => {
    expect(() => compareDirectories([ktr('../x.ktr', 'A', 0)], [], defaultConfig())).toThrow(DirectoryInputError);
    expect(() => compareDirectories([ktr('a\\x.ktr', 'A', 0), ktr('a/x.ktr', 'A', 1)], [], defaultConfig()))
      .toThrow(DirectoryInputError);
    expect(() => compareDirectories([ktr('x.ktr', 'A', 0)], [], { ...defaultConfig(), maxFileBytes: 8 }))
      .toThrow(DirectoryInputError);
  });

  it('normalizePath: rejects absolute, drive, NUL and dot segments with the Java message', () => {
    for (const bad of ['', '/a.ktr', 'c:/a.ktr', 'a\0.ktr', 'a//b.ktr', './a.ktr', 'a/', 'a/../b.ktr']) {
      expect(() => normalizePath(bad), JSON.stringify(bad)).toThrow('Only safe relative file paths are accepted');
    }
    expect(normalizePath('dir\\sub\\a.ktr')).toBe('dir/sub/a.ktr');
  });

  it('ignores unsupported extensions and sorts files by their after path, else before path', () => {
    const r = compareDirectories([ktr('b.ktr', 'B', 0), { name: 'notes.txt', content: 'x' }, ktr('z.KTR', 'Z', 0)],
      [ktr('a.ktr', 'Q', 9), ktr('b.ktr', 'B', 1), { name: 'c.kdb', content: '<connection><name>DB</name></connection>' }],
      advancedConfig());
    expect(r.files.map((f) => f.afterPath ?? f.beforePath)).toEqual(['a.ktr', 'b.ktr', 'c.kdb']);
    // info/name is volatile and layout is excluded, so z.KTR -> a.ktr is a semantic rename.
    expect(r.files[0]).toMatchObject({ beforePath: 'z.KTR', status: 'renamed', method: 'semantic' });
  });
});
