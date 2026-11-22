// KtrDiffCli.CompareCommand: compare two documents (or two folders), render, map to an exit code.
// Exit codes: 0 completed, 1 --fail-on matched, 2 input/parsing/configuration error.

import { writeFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { compareDocuments, renderHtml, renderJson, renderText, type ChangeSet, type DiffConfig } from '@ktrdiff/core';
import { isDirectory, isRegularFile, readDocument } from '../fs-input.ts';
import { colorizeReport, parseColorMode, useColor } from '../color.ts';
import { CliError, isFsError, type CliIo } from '../io.ts';
import { runDirectory } from './directory.ts';
import { buildConfig, type CompareOptions } from './options.ts';

export function runCompare(before: string, after: string, options: CompareOptions, io: CliIo): number {
  const beforePath = resolve(io.cwd, before);
  const afterPath = resolve(io.cwd, after);
  if (isDirectory(beforePath) && isDirectory(afterPath)) return runDirectory(before, after, options, io);
  try {
    const config = buildConfig(options, io);
    for (const [shown, p] of [[before, beforePath], [after, afterPath]] as const) {
      if (!isRegularFile(p)) {
        io.stderr('ktrdiff: file not found: ' + shown + '\n');
        return 2;
      }
    }
    const start = performance.now();
    const changeSet = compareDocuments(readDocument(beforePath, options.pentahoVersion),
      readDocument(afterPath, options.pentahoVersion), config);
    if (config.verbose) {
      io.stderr(`ktrdiff: compared ${basename(beforePath)} vs ${basename(afterPath)} in `
        + `${Math.floor(performance.now() - start)} ms (${changeSet.changes.length} changes, `
        + `${changeSet.warnings.length} warnings)\n`);
    }
    return report(changeSet, config, options, io);
  } catch (e) {
    if (e instanceof CliError || isFsError(e)) {
      io.stderr('ktrdiff: ' + e.message + '\n');
      return 2;
    }
    throw e;
  }
}

export function report(changeSet: ChangeSet, config: DiffConfig, options: CompareOptions, io: CliIo): number {
  const color = parseColorMode(options.color);
  const rendered = render(changeSet, config, options.format);
  if (options.output !== undefined) {
    writeFileSync(resolve(io.cwd, options.output), rendered, 'utf8');
    io.stderr('ktrdiff: report written to ' + options.output + '\n');
  } else {
    const colored = options.format.toLowerCase() === 'text' && useColor(color, io.colorTerminal);
    io.stdout((colored ? colorizeReport(rendered) : rendered) + '\n');
  }
  if (changeSet.errors.length > 0) return 2;
  return failOnExit(changeSet, config, io);
}

function render(changeSet: ChangeSet, config: DiffConfig, format: string): string {
  switch (format.toLowerCase()) {
    case 'json': return renderJson(changeSet, config);
    case 'html': return renderHtml(changeSet, config);
    case 'text': return renderText(changeSet, config);
    default: throw new CliError('Unknown format: ' + format + ' (use text, json or html)');
  }
}

/** CompareCommand.failOnExit: 1 when the --fail-on condition matches, 2 for an unknown value. */
export function failOnExit(changeSet: ChangeSet, config: DiffConfig, io: CliIo): number {
  const failOn = config.failOn.toLowerCase();
  switch (failOn) {
    case 'any': return changeSet.changes.some((c) => !c.volatile) ? 1 : 0;
    case 'functional': return changeSet.changes.some((c) => c.classification === 'functional') ? 1 : 0;
    case 'unknown': return changeSet.changes.some((c) => c.classification === 'unknown') ? 1 : 0;
    case 'none': return 0;
    default:
      io.stderr('ktrdiff: unknown --fail-on value: ' + failOn + '\n');
      return 2;
  }
}
