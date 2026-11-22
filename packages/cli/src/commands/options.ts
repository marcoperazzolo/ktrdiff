// KtrDiffCli.CompareOptions: the option mixin shared by the root command, compare and directory,
// and buildConfig (file configuration first, then CLI arguments on top).

import { parseArgs, type ParseArgsOptionsConfig } from 'node:util';
import { modeFromId, withInclude, type DiffConfig } from '@ktrdiff/core';
import { loadConfig, loadConfigFile } from '../config-files.ts';
import { resolve } from 'node:path';
import { CliError, type CliIo } from '../io.ts';

export interface CompareOptions {
  mode?: string;
  format: string;
  output?: string;
  config?: string;
  ignoreLayout: boolean;
  includeLayout: boolean;
  ignoreSqlFormatting?: boolean;
  ignoreScriptWhitespace?: boolean;
  showXmlPaths: boolean;
  showRaw: boolean;
  failOn?: string;
  pentahoVersion?: string;
  verbose: boolean;
  /** auto | always | never: ANSI colours in text reports printed on stdout. */
  color?: string;
}

export interface ParsedCommand<T> {
  options: T;
  positionals: string[];
  help: boolean;
}

const COMPARE_OPTIONS = {
  'mode': { type: 'string' },
  'format': { type: 'string' },
  'output': { type: 'string' },
  'config': { type: 'string' },
  'ignore-layout': { type: 'boolean' },
  'include-layout': { type: 'boolean' },
  'ignore-sql-formatting': { type: 'boolean' },
  'no-ignore-sql-formatting': { type: 'boolean' },
  'ignore-script-whitespace': { type: 'boolean' },
  'no-ignore-script-whitespace': { type: 'boolean' },
  'show-xml-paths': { type: 'boolean' },
  'show-raw': { type: 'boolean' },
  'fail-on': { type: 'string' },
  'pentaho-version': { type: 'string' },
  'verbose': { type: 'boolean' },
  'color': { type: 'string' },
  'help': { type: 'boolean', short: 'h' },
  'version': { type: 'boolean', short: 'V' },
} as const;

/** parseArgs failures are usage errors (exit 2), worded by Node instead of picocli (D4). */
function parse<O extends ParseArgsOptionsConfig>(args: readonly string[], options: O) {
  try {
    return parseArgs({ args: [...args], options, allowPositionals: true, strict: true, tokens: true });
  } catch (e) {
    throw new CliError(e instanceof Error ? e.message : String(e));
  }
}

/**
 * Picocli negatable options: `--x` / `--no-x`, the last one on the command line wins, absent
 * stays undefined so the file configuration is kept.
 */
function negatable(tokens: readonly { kind: string; name?: string }[], name: string): boolean | undefined {
  let value: boolean | undefined;
  for (const t of tokens) {
    if (t.kind !== 'option') continue;
    if (t.name === name) value = true;
    else if (t.name === 'no-' + name) value = false;
  }
  return value;
}

export function parseCompareArgs(args: readonly string[]): ParsedCommand<CompareOptions> & { version: boolean } {
  const { values: v, positionals, tokens } = parse(args, COMPARE_OPTIONS);
  const options: CompareOptions = {
    format: v.format ?? 'text',
    ignoreLayout: v['ignore-layout'] === true,
    includeLayout: v['include-layout'] === true,
    showXmlPaths: v['show-xml-paths'] === true,
    showRaw: v['show-raw'] === true,
    verbose: v.verbose === true,
  };
  if (v.mode !== undefined) options.mode = v.mode;
  if (v.output !== undefined) options.output = v.output;
  if (v.config !== undefined) options.config = v.config;
  if (v['fail-on'] !== undefined) options.failOn = v['fail-on'];
  if (v['pentaho-version'] !== undefined) options.pentahoVersion = v['pentaho-version'];
  if (v.color !== undefined) options.color = v.color;
  const sql = negatable(tokens, 'ignore-sql-formatting');
  if (sql !== undefined) options.ignoreSqlFormatting = sql;
  const script = negatable(tokens, 'ignore-script-whitespace');
  if (script !== undefined) options.ignoreScriptWhitespace = script;
  return { options, positionals, help: v.help === true, version: v.version === true };
}

/** Options of inspect and validate: only the standard help flag. */
export function parseFileArgs(args: readonly string[]): ParsedCommand<object> {
  const { values, positionals } = parse(args, { help: { type: 'boolean', short: 'h' } } as const);
  return { options: {}, positionals, help: values.help === true };
}

/** CompareOptions.buildConfig. Every failure here is a user error (exit 2). */
export function buildConfig(options: CompareOptions, io: CliIo): DiffConfig {
  try {
    let cfg = options.config !== undefined
      ? loadConfigFile(resolve(io.cwd, options.config))
      : loadConfig(io.cwd, io.home);
    // CLI arguments take precedence over any file-based configuration
    if (options.mode !== undefined) cfg = { ...cfg, mode: modeFromId(options.mode) };
    if (options.ignoreLayout) {
      cfg = { ...withInclude(cfg, 'layout', false), layoutStepPositions: false, layoutNotePositions: false };
    }
    if (options.includeLayout) {
      cfg = { ...withInclude(cfg, 'layout', true), layoutStepPositions: true, layoutNotePositions: true };
      if (cfg.mode === 'quick') cfg = { ...cfg, mode: 'custom' };
    }
    if (options.ignoreSqlFormatting !== undefined) cfg = { ...cfg, sqlIgnoreFormatting: options.ignoreSqlFormatting };
    if (options.ignoreScriptWhitespace !== undefined) {
      cfg = { ...cfg, scriptsIgnoreWhitespace: options.ignoreScriptWhitespace };
    }
    if (options.showXmlPaths) cfg = { ...cfg, showXmlPaths: true };
    if (options.showRaw) cfg = { ...cfg, showRawDiff: true };
    if (options.failOn !== undefined) cfg = { ...cfg, failOn: options.failOn };
    return { ...cfg, verbose: options.verbose };
  } catch (e) {
    if (e instanceof CliError) throw e;
    throw new CliError(e instanceof Error ? e.message : String(e));
  }
}
