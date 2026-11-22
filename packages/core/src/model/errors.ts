// it.ktrdiff.core.model.ErrorCode, DiffError, DiffWarning — controlled failures and warnings.

export type ErrorCode =
  | 'invalid_xml'
  | 'unsupported_document'
  | 'invalid_ktr'
  | 'duplicate_step_names'
  | 'ambiguous_step_match'
  | 'file_too_large';

/** Java declaration order, for comparators that sort by enum ordinal. */
export const ERROR_CODES: readonly ErrorCode[] = [
  'invalid_xml',
  'unsupported_document',
  'invalid_ktr',
  'duplicate_step_names',
  'ambiguous_step_match',
  'file_too_large',
];

/** Which input an error refers to; null means both or general. */
export type Side = 'before' | 'after';

/** Controlled comparison error (invalid XML, unsupported document, ...). */
export interface DiffError {
  readonly code: ErrorCode;
  readonly message: string;
  readonly side: Side | null;
}

/** Non-fatal issue raised during comparison (e.g. ambiguous step match). */
export interface DiffWarning {
  readonly code: string;
  readonly message: string;
}

export function diffError(code: ErrorCode, message: string, side: Side | null): DiffError {
  return { code, message, side };
}

export function diffWarning(code: string, message: string): DiffWarning {
  return { code, message };
}

/** Java DiffError.toString. */
export function diffErrorToString(e: DiffError): string {
  return e.code + (e.side !== null ? ' (' + e.side + ')' : '') + ': ' + e.message;
}
