// UTF-8 helpers with java.lang.String semantics: the size limits and hashes of the v0.2.0 engine
// are computed on `String.getBytes(UTF_8)` and documents are decoded with `new String(bytes, UTF_8)`.

const QUESTION_MARK = 0x3f;

function isHighSurrogate(code: number): boolean {
  return code >= 0xd800 && code <= 0xdbff;
}

function isLowSurrogate(code: number): boolean {
  return code >= 0xdc00 && code <= 0xdfff;
}

/**
 * Byte length of `s.getBytes(UTF_8)`. Java encodes a lone surrogate as '?' (1 byte), unlike
 * TextEncoder which writes U+FFFD (3 bytes).
 */
export function utf8ByteLength(s: string): number {
  let length = 0;
  for (let i = 0; i < s.length; i++) {
    const code = s.charCodeAt(i);
    if (code < 0x80) length += 1;
    else if (code < 0x800) length += 2;
    else if (isHighSurrogate(code) && i + 1 < s.length && isLowSurrogate(s.charCodeAt(i + 1))) {
      length += 4;
      i++;
    } else if (isHighSurrogate(code) || isLowSurrogate(code)) length += 1;
    else length += 3;
  }
  return length;
}

/** `s.getBytes(UTF_8)`, lone surrogates replaced by '?' as Java does. */
export function encodeUtf8(s: string): Uint8Array {
  const out = new Uint8Array(utf8ByteLength(s));
  let p = 0;
  for (let i = 0; i < s.length; i++) {
    let code = s.charCodeAt(i);
    if (isHighSurrogate(code) && i + 1 < s.length && isLowSurrogate(s.charCodeAt(i + 1))) {
      code = 0x10000 + ((code - 0xd800) << 10) + (s.charCodeAt(++i) - 0xdc00);
      out[p++] = 0xf0 | (code >> 18);
      out[p++] = 0x80 | ((code >> 12) & 0x3f);
      out[p++] = 0x80 | ((code >> 6) & 0x3f);
      out[p++] = 0x80 | (code & 0x3f);
    } else if (isHighSurrogate(code) || isLowSurrogate(code)) {
      out[p++] = QUESTION_MARK;
    } else if (code < 0x80) {
      out[p++] = code;
    } else if (code < 0x800) {
      out[p++] = 0xc0 | (code >> 6);
      out[p++] = 0x80 | (code & 0x3f);
    } else {
      out[p++] = 0xe0 | (code >> 12);
      out[p++] = 0x80 | ((code >> 6) & 0x3f);
      out[p++] = 0x80 | (code & 0x3f);
    }
  }
  return out;
}

/**
 * `new String(bytes, UTF_8)`: a leading BOM is kept and invalid sequences become U+FFFD.
 * The number of U+FFFD per invalid sequence follows WHATWG and may differ from Java's decoder
 * on malformed input (accepted risk, see the phase 1 plan).
 */
export function decodeUtf8(bytes: Uint8Array): string {
  return new TextDecoder('utf-8', { ignoreBOM: true }).decode(bytes);
}
