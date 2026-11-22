import { describe, expect, it } from 'vitest';
import { CORE_VERSION } from '../src/index.ts';

describe('core smoke', () => {
  it('loads the public API', () => {
    expect(CORE_VERSION).toMatch(/^\d+\.\d+\.\d+/);
  });

  it('has the TextDecoder declared in env.d.ts at runtime', () => {
    const bytes = new Uint8Array([0xef, 0xbb, 0xbf, 0x41]);
    // ignoreBOM keeps a leading BOM, like Java's new String(bytes, UTF_8).
    expect(new TextDecoder('utf-8', { ignoreBOM: true }).decode(bytes)).toBe('﻿A');
  });
});
