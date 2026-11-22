// KtrDiffCli.DirectoryCommand: recursive comparison of two folders of .ktr/.kjb/.kdb documents.

import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  compareDirectories, DirectoryInputError, renderDirectoryJson, renderText, type DiffConfig, type DirectoryResult,
} from '@ktrdiff/core';
import { readDirectory } from '../fs-input.ts';
import { colorizeReport, parseColorMode, useColor } from '../color.ts';
import { CliError, isFsError, type CliIo } from '../io.ts';
import { failOnExit } from './compare.ts';
import { buildConfig, type CompareOptions } from './options.ts';

export function runDirectory(before: string, after: string, options: CompareOptions, io: CliIo): number {
  try {
    const config = buildConfig(options, io);
    const result = compareDirectories(readDirectory(resolve(io.cwd, before), before),
      readDirectory(resolve(io.cwd, after), after), config);
    const color = parseColorMode(options.color);
    const format = options.format.toLowerCase();
    let rendered: string;
    if (format === 'json') rendered = renderDirectoryJson(result, config);
    else if (format === 'text') rendered = renderDirectoryText(result, config);
    else throw new CliError('Directory output supports text or json');
    if (options.output === undefined) {
      io.stdout((format === 'text' && useColor(color, io.colorTerminal) ? colorizeReport(rendered) : rendered) + '\n');
    }
    else writeFileSync(resolve(io.cwd, options.output), rendered, 'utf8');
    if (result.files.some((f) => f.changeSet.errors.length > 0)) return 2;
    if (config.failOn !== 'none') {
      for (const f of result.files) {
        // Java maps any non-zero failOnExit (including 2 for an unknown value) to 1 here.
        if (failOnExit(f.changeSet, config, io) !== 0) return 1;
        if ((config.failOn === 'any' || config.failOn === 'functional')
          && (f.status === 'added' || f.status === 'removed' || f.status === 'renamed')) return 1;
      }
    }
    return 0;
  } catch (e) {
    if (e instanceof CliError || e instanceof DirectoryInputError || isFsError(e)) {
      io.stderr('ktrdiff: ' + e.message + '\n');
      return 2;
    }
    throw e;
  }
}

function renderDirectoryText(result: DirectoryResult, config: DiffConfig): string {
  let text = 'KTRDiff directory comparison\n';
  for (const file of result.files) {
    const renamed = file.beforePath !== null && file.afterPath !== null && file.beforePath !== file.afterPath;
    text += '\n' + file.status.toUpperCase() + '  ' + (file.beforePath ?? '')
      + (renamed ? ' -> ' : '')
      + (file.beforePath === null || file.beforePath !== file.afterPath ? file.afterPath ?? '' : '')
      + '\n' + renderText(file.changeSet, config);
  }
  for (const w of result.warnings) text += 'WARNING: ' + w.message + '\n';
  return text;
}
