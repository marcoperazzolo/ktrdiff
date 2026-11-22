// Reading documents and folders from disk into core DocumentInput values (KtrInput.of(Path) and
// DirectoryCommand.read of KtrDiffCli).

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, join, relative } from 'node:path';
import { isSupportedPath, MAX_FILES, type DocumentInput } from '@ktrdiff/core';
import { CliError } from './io.ts';

/** Files.isRegularFile / isDirectory: follow links, false when missing. */
export const isRegularFile = (p: string): boolean => existsSync(p) && statSync(p).isFile();
export const isDirectory = (p: string): boolean => existsSync(p) && statSync(p).isDirectory();

/** KtrInput.of(path, version): the display name is the file name. */
export function readDocument(path: string, pentahoVersion?: string): DocumentInput {
  const input: DocumentInput = { name: basename(path), content: new Uint8Array(readFileSync(path)) };
  if (pentahoVersion !== undefined) input.pentahoVersion = pentahoVersion;
  return input;
}

/** Same aggregate cap as the Java CLI (not the configurable maxFileBytes). */
const MAX_DIRECTORY_BYTES = 50 * 1024 * 1024;

/**
 * DirectoryCommand.read: supported regular files below `directory` (symbolic links are neither
 * followed nor read, like Files.walk + NOFOLLOW_LINKS), keyed by relative path with `/`, in
 * TreeMap order (UTF-16 code units).
 */
export function readDirectory(directory: string, shown: string = directory): DocumentInput[] {
  if (!isDirectory(directory)) throw new CliError('Directory not found: ' + shown);
  const files = new Map<string, string>();
  let total = 0;
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(path);
        continue;
      }
      if (!entry.isFile() || !isSupportedPath(path)) continue;
      if (files.size >= MAX_FILES) throw new CliError('Too many Pentaho documents');
      total += statSync(path).size;
      if (total > MAX_DIRECTORY_BYTES) throw new CliError('Directory exceeds 50 MiB');
      files.set(relative(directory, path).replaceAll('\\', '/'), path);
    }
  };
  walk(directory);
  const names = [...files.keys()].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  return names.map((name) => ({ name, content: new Uint8Array(readFileSync(files.get(name)!)) }));
}
