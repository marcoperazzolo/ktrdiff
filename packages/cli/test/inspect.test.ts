// Parser parity checkpoint (step D2): the inspect formatter over the TS parser must reproduce every
// recorded `inspect*.txt` of the oracle, stdout byte-equal, error code and message on failure
// (message only compared outside invalid_xml, see D1 in docs/parity.md).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { AdapterRegistry, parseTransformation, ParseError } from '@ktrdiff/core';
import { publicCases, readExits, readReference, type ParityCase } from '../../../parity/lib/cases.ts';
import { formatInspect, formatInspectError } from '../src/commands/inspect.ts';

// The real registry: the adapter column of every reference also checks its dispatch order.
const registry = new AdapterRegistry();
const adapterNameFor = (type: string): string => registry.adapterNameFor(type);

interface InspectRun {
  exit: number;
  stdout: string;
  stderr: string;
}

function runInspect(file: string): InspectRun {
  const content = new Uint8Array(readFileSync(file));
  try {
    const t = parseTransformation({ name: file, content });
    return { exit: 0, stdout: formatInspect(t, adapterNameFor), stderr: '' };
  } catch (e) {
    if (e instanceof ParseError) return { exit: 2, stdout: '', stderr: formatInspectError(e) };
    throw e;
  }
}

/** D1: Xerces wording of XML errors is not reproduced, only the code. */
function withoutXmlMessage(stderr: string): string {
  return stderr.replace(/(\[invalid_xml\]) .*$/s, '$1');
}

const inspections: [string, ParityCase, string, string][] = [];
for (const c of publicCases()) {
  if (c.kind === 'pair') {
    inspections.push([`${c.group}/${c.id} before`, c, 'inspect.before.txt', c.before!]);
    inspections.push([`${c.group}/${c.id} after`, c, 'inspect.after.txt', c.after!]);
  } else if (c.kind === 'single') {
    inspections.push([`${c.group}/${c.id}`, c, 'inspect.txt', c.doc!]);
  }
}

describe('inspect parity (oracle v0.2.0)', () => {
  it('covers every recorded inspect output', () => {
    expect(inspections.length).toBe(92);
  });

  it.each(inspections)('%s', (_label, c, output, input) => {
    const recorded = readExits(c)[output]!;
    const actual = runInspect(join(c.dir, input));
    expect(actual.exit).toBe(recorded.exit);
    expect(actual.stdout).toBe(readReference(c, output));
    expect(withoutXmlMessage(actual.stderr)).toBe(withoutXmlMessage(recorded.stderr.replace(/\r\n/g, '\n')));
  });
});
