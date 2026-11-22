// XML verdict table: on every single-document probe, the tokenizer must accept or reject exactly
// like the oracle's Xerces did (recorded `validate` exit and error code). Messages differ (D1).
// Reads files through Node, so it is type-checked by parity/tsconfig.json, not the core program.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { publicCases, readExits } from '../../../parity/lib/cases.ts';
import { ParseError } from '../src/xml/parse-error.ts';
import { parseXmlBytes } from '../src/xml/secure-xml.ts';

const singles = publicCases().filter((c) => c.group === 'probes' && c.kind === 'single');

function verdict(bytes: Uint8Array): string {
  try {
    parseXmlBytes(bytes);
    return 'accepted';
  } catch (e) {
    if (e instanceof ParseError) return e.code;
    throw e;
  }
}

describe('xml probe verdicts (oracle = Xerces)', () => {
  it('finds the single-document probes', () => {
    expect(singles.length).toBeGreaterThanOrEqual(30);
  });

  it.each(singles.map((c) => [c.id, c] as const))('%s', (_id, c) => {
    const validate = readExits(c)['validate.txt']!;
    const oracleCode = /\[([a-z_]+)\]/.exec(validate.stderr)?.[1];
    // Only XML-layer rejections must match here; later rejections (e.g. invalid_ktr) mean the
    // XML itself was accepted.
    const expected = validate.exit !== 0 && (oracleCode === 'invalid_xml' || oracleCode === 'file_too_large')
      ? oracleCode
      : 'accepted';
    const bytes = new Uint8Array(readFileSync(join(c.dir, c.doc!)));
    expect(verdict(bytes)).toBe(expected);
  });
});
