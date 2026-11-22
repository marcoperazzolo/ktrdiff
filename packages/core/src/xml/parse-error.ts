// it.ktrdiff.core.xml.KtrParseException — controlled parse failure carrying a stable error code.

import type { ErrorCode } from '../model/errors.ts';

export class ParseError extends Error {
  readonly code: ErrorCode;

  constructor(code: ErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'ParseError';
    this.code = code;
  }
}

/** Well-formedness failure; the prefix matches the Java wording, the detail does not (D1). */
export function notWellFormed(detail: string): ParseError {
  return new ParseError('invalid_xml', `Not a well-formed XML document: ${detail}`);
}
