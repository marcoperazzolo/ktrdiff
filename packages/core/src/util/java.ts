// Helpers that reproduce java.lang semantics the v0.2.0 engine relies on. JS built-ins with
// similar names (trim, split, \s, toString, toFixed, localeCompare) behave differently on edge
// cases, and those differences would leak into diff output.

/** `String.trim()`: strips leading/trailing code units <= U+0020 only (not NBSP, U+2028, BOM). */
export function javaTrim(s: string): string {
  let start = 0;
  let end = s.length;
  while (start < end && s.charCodeAt(start) <= 0x20) start++;
  while (end > start && s.charCodeAt(end - 1) <= 0x20) end--;
  return start === 0 && end === s.length ? s : s.substring(start, end);
}

/** `String.isEmpty()` after `trim()`, the Java idiom for "blank" in the engine. */
export function javaIsBlankTrim(s: string): boolean {
  return javaTrim(s).length === 0;
}

/**
 * `Character.isWhitespace(char)`: Unicode space/line/paragraph separators except the
 * non-breaking ones (U+00A0, U+2007, U+202F), plus the ASCII controls TAB, LF, VT, FF, CR and
 * the information separators U+001C..U+001F. Takes one UTF-16 code unit.
 */
export function javaIsWhitespace(code: number): boolean {
  if (code >= 0x09 && code <= 0x0d) return true;
  if (code >= 0x1c && code <= 0x20) return true;
  if (code === 0xa0 || code === 0x2007 || code === 0x202f) return false;
  return code === 0x1680 || (code >= 0x2000 && code <= 0x200a) || code === 0x2028
    || code === 0x2029 || code === 0x205f || code === 0x3000;
}

const LETTER_OR_DIGIT = /^[\p{L}\p{Nd}]$/u;

/**
 * `Character.isLetterOrDigit(char)`: general category L* or Nd. Takes one UTF-16 code unit,
 * so a lone surrogate is never a letter, like in Java.
 */
export function javaIsLetterOrDigit(code: number): boolean {
  if (code < 0x80) {
    return (code >= 0x30 && code <= 0x39) || (code >= 0x41 && code <= 0x5a) || (code >= 0x61 && code <= 0x7a);
  }
  if (code >= 0xd800 && code <= 0xdfff) return false;
  return LETTER_OR_DIGIT.test(String.fromCharCode(code));
}

/**
 * `String.split(separator, limit)` for a literal (non-regex-special) separator, which is the
 * only form the engine uses. limit > 0: at most `limit` parts, the last keeps the remainder;
 * limit == 0: trailing empty strings removed; limit < 0: everything kept.
 */
export function javaSplit(s: string, separator: string, limit = 0): string[] {
  if (separator.length === 0) throw new Error('javaSplit: empty separator is not supported');
  const parts: string[] = [];
  let from = 0;
  let index = s.indexOf(separator, from);
  if (index < 0) return [s];
  while (index >= 0 && (limit <= 0 || parts.length < limit - 1)) {
    parts.push(s.substring(from, index));
    from = index + separator.length;
    index = s.indexOf(separator, from);
  }
  parts.push(s.substring(from));
  if (limit === 0) {
    let size = parts.length;
    while (size > 0 && parts[size - 1] === '') size--;
    parts.length = size;
  }
  return parts;
}

/** `String.compareTo` sign: UTF-16 code-unit order, never locale-aware. */
export function compareUtf16(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Shortest round-trip decimal digits and decimal exponent of a finite, non-zero |value|. */
function shortestDigits(value: number): { digits: string; exponent: number } {
  // toExponential() without an argument yields the shortest digits that round-trip, the same
  // digit selection as Double.toString since JDK 19 (the oracle runs on JDK 21).
  const exp = Math.abs(value).toExponential();
  const e = exp.indexOf('e');
  const digits = exp.substring(0, e).replace('.', '');
  return { digits, exponent: Number(exp.substring(e + 1)) };
}

/**
 * `Double.toString(double)`: plain notation with at least one fraction digit for
 * 1e-3 <= |v| < 1e7, otherwise computerized scientific notation such as `9.0E-4` or `1.0E7`.
 */
export function javaDoubleToString(value: number): string {
  if (Number.isNaN(value)) return 'NaN';
  if (value === Infinity) return 'Infinity';
  if (value === -Infinity) return '-Infinity';
  if (value === 0) return Object.is(value, -0) ? '-0.0' : '0.0';
  const sign = value < 0 ? '-' : '';
  const abs = Math.abs(value);
  const { digits, exponent } = shortestDigits(value);
  if (abs >= 1e-3 && abs < 1e7) {
    if (exponent >= 0) {
      const intPart = digits.length > exponent + 1 ? digits.substring(0, exponent + 1) : digits.padEnd(exponent + 1, '0');
      const fraction = digits.length > exponent + 1 ? digits.substring(exponent + 1) : '0';
      return `${sign}${intPart}.${fraction}`;
    }
    return `${sign}0.${'0'.repeat(-exponent - 1)}${digits}`;
  }
  const fraction = digits.length > 1 ? digits.substring(1) : '0';
  return `${sign}${digits[0]}.${fraction}E${exponent}`;
}

/**
 * `String.format(Locale.ROOT, "%.<n>f", value)`: Java rounds the decimal digits of the value
 * HALF_UP (so 1.0005 -> "1.001", where toFixed gives "1.000" from the exact binary value).
 * Uses the shortest digits; Formatter's legacy FloatingDecimal can emit a longer digit string
 * in rare cases, which only matters if that extra digit sits exactly at the rounding position.
 */
export function javaFormatFixed(value: number, fractionDigits: number): string {
  if (!Number.isFinite(value)) return Number.isNaN(value) ? 'NaN' : value > 0 ? 'Infinity' : '-Infinity';
  const negative = value < 0 || Object.is(value, -0);
  const sign = negative ? '-' : '';
  if (value === 0) return sign + (fractionDigits > 0 ? `0.${'0'.repeat(fractionDigits)}` : '0');
  const { digits, exponent } = shortestDigits(value);
  // Place the digits in a fixed-point string: integer part (at least "0") and fraction part.
  let intPart: string;
  let fracPart: string;
  if (exponent >= 0) {
    intPart = digits.length > exponent + 1 ? digits.substring(0, exponent + 1) : digits.padEnd(exponent + 1, '0');
    fracPart = digits.length > exponent + 1 ? digits.substring(exponent + 1) : '';
  } else {
    intPart = '0';
    fracPart = '0'.repeat(-exponent - 1) + digits;
  }
  // Round HALF_UP on the decimal string: only the first dropped digit matters.
  const roundUp = fracPart.length > fractionDigits && fracPart.charCodeAt(fractionDigits) >= 0x35;
  let kept = intPart + fracPart.substring(0, fractionDigits).padEnd(fractionDigits, '0');
  if (roundUp) {
    const chars = kept.split('');
    let i = chars.length - 1;
    while (i >= 0 && chars[i] === '9') chars[i--] = '0';
    if (i >= 0) chars[i] = String.fromCharCode(chars[i]!.charCodeAt(0) + 1);
    else chars.unshift('1');
    kept = chars.join('');
  }
  const intLength = kept.length - fractionDigits;
  const integer = kept.substring(0, intLength).replace(/^0+(?=\d)/, '');
  return fractionDigits > 0 ? `${sign}${integer}.${kept.substring(intLength)}` : sign + integer;
}

/**
 * `Integer.valueOf(String)` returning null instead of throwing NumberFormatException: optional
 * sign, decimal digits, 32-bit range. Only ASCII digits are accepted (Java also accepts other
 * Unicode decimal digits; Pentaho never writes them in numeric elements).
 */
export function javaParseInt(s: string): number | null {
  if (!/^[+-]?[0-9]+$/.test(s)) return null;
  const n = Number(s);
  return n >= -2147483648 && n <= 2147483647 ? n : null;
}
