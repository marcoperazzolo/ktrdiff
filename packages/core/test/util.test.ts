import { describe, expect, it } from 'vitest';
import {
  compareUtf16, javaDoubleToString, javaFormatFixed, javaIsLetterOrDigit, javaIsWhitespace, javaSplit, javaTrim,
} from '../src/util/java.ts';
import { sha256, sha256Base64, sha256Hex, toBase64, toHex } from '../src/util/sha256.ts';
import { decodeUtf8, encodeUtf8, utf8ByteLength } from '../src/util/utf8.ts';

describe('util/java', () => {
  it('javaTrim strips only code units <= U+0020', () => {
    expect(javaTrim(' \t\n a b \r\u0000')).toBe('a b');
    expect(javaTrim(' x ')).toBe(' x ');
    expect(javaTrim(' x﻿')).toBe(' x﻿');
    expect(javaTrim('   ')).toBe('');
    expect(javaTrim('')).toBe('');
  });

  it('javaIsWhitespace follows Character.isWhitespace', () => {
    for (const c of [0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x1c, 0x1f, 0x20, 0x1680, 0x2000, 0x2028, 0x2029, 0x3000]) {
      expect(javaIsWhitespace(c), c.toString(16)).toBe(true);
    }
    for (const c of [0x00, 0x08, 0x41, 0xa0, 0x2007, 0x202f, 0x200b, 0xfeff, 0x85]) {
      expect(javaIsWhitespace(c), c.toString(16)).toBe(false);
    }
  });

  it('javaIsLetterOrDigit follows Character.isLetterOrDigit', () => {
    for (const ch of ['a', 'Z', '0', '9', 'è', 'ß', 'Ж', '漢', '٣']) {
      expect(javaIsLetterOrDigit(ch.charCodeAt(0)), ch).toBe(true);
    }
    for (const ch of ['_', '$', ' ', '-', ' ', '²', '\ud83d']) {
      expect(javaIsLetterOrDigit(ch.charCodeAt(0)), ch).toBe(false);
    }
  });

  it('javaSplit drops trailing empty strings with limit 0 and keeps them with -1', () => {
    expect(javaSplit('a\nb\n\n', '\n')).toEqual(['a', 'b']);
    expect(javaSplit('a\nb\n\n', '\n', -1)).toEqual(['a', 'b', '', '']);
    expect(javaSplit('\na', '\n')).toEqual(['', 'a']);
    expect(javaSplit('', '\n')).toEqual(['']);
    expect(javaSplit('', '\n', -1)).toEqual(['']);
    expect(javaSplit('\n\n', '\n')).toEqual([]);
    expect(javaSplit('a b c', ' ')).toEqual(['a', 'b', 'c']);
    expect(javaSplit('x->y->z', '->', 2)).toEqual(['x', 'y->z']);
    expect(javaSplit('x->', '->', 2)).toEqual(['x', '']);
    expect(javaSplit('9.4.0', '.')).toEqual(['9', '4', '0']);
  });

  it('compareUtf16 orders by UTF-16 code units', () => {
    expect(compareUtf16('B', 'a')).toBeLessThan(0);
    expect(compareUtf16('a', 'a')).toBe(0);
    expect(compareUtf16('é', 'z')).toBeGreaterThan(0);
    expect(compareUtf16('￿', '😀')).toBeGreaterThan(0);
    expect(compareUtf16('ab', 'a')).toBeGreaterThan(0);
  });

  it('javaDoubleToString matches Double.toString', () => {
    expect(javaDoubleToString(1)).toBe('1.0');
    expect(javaDoubleToString(0.982)).toBe('0.982');
    expect(javaDoubleToString(9.0e-4)).toBe('9.0E-4');
    expect(javaDoubleToString(1.0e7)).toBe('1.0E7');
    expect(javaDoubleToString(1.234e-5)).toBe('1.234E-5');
    expect(javaDoubleToString(0.001)).toBe('0.001');
    expect(javaDoubleToString(9999999.5)).toBe('9999999.5');
    expect(javaDoubleToString(123.0)).toBe('123.0');
    expect(javaDoubleToString(0.1 + 0.2)).toBe('0.30000000000000004');
    expect(javaDoubleToString(2 / 3)).toBe('0.6666666666666666');
    expect(javaDoubleToString(-0.5)).toBe('-0.5');
    expect(javaDoubleToString(0)).toBe('0.0');
    expect(javaDoubleToString(-0)).toBe('-0.0');
    expect(javaDoubleToString(1.5e300)).toBe('1.5E300');
    expect(javaDoubleToString(Number.NaN)).toBe('NaN');
    expect(javaDoubleToString(Infinity)).toBe('Infinity');
  });

  it('javaFormatFixed rounds HALF_UP on the decimal digits like %.3f', () => {
    expect(javaFormatFixed(1.0005, 3)).toBe('1.001');
    expect((1.0005).toFixed(3)).toBe('1.000');
    expect(javaFormatFixed(0.7, 3)).toBe('0.700');
    expect(javaFormatFixed(0.9995, 3)).toBe('1.000');
    expect(javaFormatFixed(0.12345, 3)).toBe('0.123');
    expect(javaFormatFixed(0.0004, 3)).toBe('0.000');
    expect(javaFormatFixed(0.0005, 3)).toBe('0.001');
    expect(javaFormatFixed(2 / 3, 3)).toBe('0.667');
    expect(javaFormatFixed(1, 3)).toBe('1.000');
    expect(javaFormatFixed(99.9996, 3)).toBe('100.000');
    expect(javaFormatFixed(-0.0005, 3)).toBe('-0.001');
    expect(javaFormatFixed(0, 3)).toBe('0.000');
    expect(javaFormatFixed(1234567.25, 1)).toBe('1234567.3');
    expect(javaFormatFixed(2.5, 0)).toBe('3');
  });
});

describe('util/sha256', () => {
  it('matches the NIST SHA-256 vectors', () => {
    expect(sha256Hex('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    expect(sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(sha256Hex('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq'))
      .toBe('248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1');
    expect(toHex(sha256(new Uint8Array(1_000_000).fill(0x61))))
      .toBe('cdc76e5c9914fb9281a1c7e284d73e67f1809a48a497200e046d39ccc7112cd0');
  });

  it('hashes block-boundary lengths', () => {
    // 55/56/64 bytes exercise the padding that spills into a second block.
    expect(sha256Hex('a'.repeat(55))).toBe('9f4390f8d30c2dd92ec9f095b65e2b9ae9b0a925a5258e241c9f1e910f734318');
    expect(sha256Hex('a'.repeat(56))).toBe('b35439a4ac6f0948b6d6f9e3c6af0f5f590ce20f1bde7090ef7970686ec6738a');
    expect(sha256Hex('a'.repeat(64))).toBe('ffe054fe7ae0cb6dc65c3af9b61d5209f439851db43d0ba5997337df154668eb');
  });

  it('encodes Base64 with padding and hashes the UTF-8 bytes of a string', () => {
    expect(toBase64(new Uint8Array([]))).toBe('');
    expect(toBase64(new Uint8Array([0x66]))).toBe('Zg==');
    expect(toBase64(new Uint8Array([0x66, 0x6f]))).toBe('Zm8=');
    expect(toBase64(new Uint8Array([0x66, 0x6f, 0x6f]))).toBe('Zm9v');
    expect(toBase64(new Uint8Array([0xfb, 0xff]))).toBe('+/8=');
    expect(sha256Base64('abc')).toBe('ungWv48Bz+pBQUDeXa4iI7ADYaOWF3qctBD/YfIAFa0=');
    expect(sha256Hex('è')).toBe(toHex(sha256(new Uint8Array([0xc3, 0xa8]))));
  });
});

describe('util/utf8', () => {
  it('computes the UTF-8 byte length like String.getBytes(UTF_8)', () => {
    expect(utf8ByteLength('')).toBe(0);
    expect(utf8ByteLength('abc')).toBe(3);
    expect(utf8ByteLength('è')).toBe(2);
    expect(utf8ByteLength('€')).toBe(3);
    expect(utf8ByteLength('😀')).toBe(4);
    expect(utf8ByteLength('﻿A')).toBe(4);
    // Java writes '?' for a lone surrogate.
    expect(utf8ByteLength('\ud83d')).toBe(1);
    expect(utf8ByteLength('a\ude00b')).toBe(3);
  });

  it('encodes like String.getBytes(UTF_8)', () => {
    expect([...encodeUtf8('aè€😀')]).toEqual([0x61, 0xc3, 0xa8, 0xe2, 0x82, 0xac, 0xf0, 0x9f, 0x98, 0x80]);
    expect([...encodeUtf8('x\ud83dy')]).toEqual([0x78, 0x3f, 0x79]);
    const sample = 'Ünïcødé   漢字 😀';
    expect(decodeUtf8(encodeUtf8(sample))).toBe(sample);
  });

  it('decodes keeping a leading BOM and replacing invalid bytes with U+FFFD', () => {
    expect(decodeUtf8(new Uint8Array([0xef, 0xbb, 0xbf, 0x3c, 0x61, 0x2f, 0x3e]))).toBe('﻿<a/>');
    expect(decodeUtf8(new Uint8Array([0x61, 0xff, 0x62]))).toBe('a�b');
    expect(decodeUtf8(new Uint8Array([0x61, 0xc3]))).toBe('a�');
    expect(decodeUtf8(new Uint8Array([0xe8, 0x61]))).toBe('�a');
  });
});
