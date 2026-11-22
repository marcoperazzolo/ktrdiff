// KtrDiffCli.InspectCommand: structure of one transformation (steps, hops, notes, connections).
// Lines end with "\n": the oracle's `%n` is normalized by the recorder.

import { readFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { AdapterRegistry, parseTransformation, ParseError, type TransformationModel } from '@ktrdiff/core';
import type { CliIo } from '../io.ts';
import { javaTrim } from '../java.ts';

/** `%-Ns`: left-justified, padded with spaces to N UTF-16 units, never truncated. */
function padRight(s: string, width: number): string {
  return s.padEnd(width, ' ');
}

/** Stdout of `inspect` for a parsed transformation. */
export function formatInspect(t: TransformationModel, adapterNameFor: (stepType: string) => string): string {
  const out: string[] = [];
  out.push('Transformation: ' + (t.name.length === 0 ? '(unnamed)' : t.name));
  const description = javaTrim(t.description);
  if (description.length > 0) out.push('Description: ' + description);
  out.push('Steps: ' + t.steps.length);
  for (const s of t.steps) {
    out.push('  ' + padRight(s.name, 40) + ' ' + padRight('[' + s.type + ']', 24)
      + ' adapter=' + adapterNameFor(s.type) + ' pos=' + s.positionString());
  }
  out.push('Hops: ' + t.hops.length);
  for (const h of t.hops) out.push('  ' + h.toString());
  out.push('Notes: ' + t.notes.length);
  for (const n of t.notes) out.push('  "' + n.label() + '" at ' + n.positionString());
  out.push('Connections: ' + t.connections.length);
  for (const c of t.connections) out.push('  ' + c.name);
  return out.map((line) => line + '\n').join('');
}

/** Stderr of `inspect` when parsing fails (exit code 2). */
export function formatInspectError(e: ParseError): string {
  return 'ktrdiff: [' + e.code + '] ' + e.message + '\n';
}

/**
 * KtrParser.parseFile: an unreadable file is an invalid_xml ParseError naming the file, the size
 * limit is the parser default (50 MiB).
 */
export function parseTransformationFile(file: string, io: CliIo): TransformationModel {
  let content: Uint8Array;
  try {
    content = new Uint8Array(readFileSync(resolve(io.cwd, file)));
  } catch {
    throw new ParseError('invalid_xml', 'Cannot read file: ' + basename(file));
  }
  return parseTransformation({ name: basename(file), content });
}

export function runInspect(file: string, io: CliIo): number {
  try {
    const registry = new AdapterRegistry();
    io.stdout(formatInspect(parseTransformationFile(file, io), (type) => registry.adapterNameFor(type)));
    return 0;
  } catch (e) {
    if (!(e instanceof ParseError)) throw e;
    io.stderr(formatInspectError(e));
    return 2;
  }
}
