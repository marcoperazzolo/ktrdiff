// it.ktrdiff.core.model.PentahoVersion — a PDI version such as 9.4.0.0-343. KTR files do not
// embed it, so it comes from outside (expected.yml, CLI option); unknown is always tolerated.

import { javaParseInt, javaSplit, javaTrim } from '../util/java.ts';

function intAt(parts: readonly string[], i: number): number | null {
  const p = parts[i];
  return p === undefined ? null : javaParseInt(javaTrim(p));
}

export class PentahoVersion {
  constructor(
    readonly major: number | null,
    readonly minor: number | null,
    readonly patch: number | null,
    readonly build: string | null,
    readonly raw: string | null,
  ) {}

  /** Parse forms like "9.4.0.0-343", "9.4", "pdi-9.4.0.0-343", "10.2.0.0". Null on blank. */
  static parse(raw: string | null | undefined): PentahoVersion | null {
    if (raw === null || raw === undefined) return null;
    const s = javaTrim(raw);
    if (s.length === 0) return null;
    const v = s.toLowerCase().startsWith('pdi-') ? s.substring(4) : s;
    let numberPart = v;
    let build: string | null = null;
    const dash = v.indexOf('-');
    if (dash >= 0) {
      numberPart = v.substring(0, dash);
      build = v.substring(dash + 1);
    }
    const parts = javaSplit(numberPart, '.');
    return new PentahoVersion(intAt(parts, 0), intAt(parts, 1), intAt(parts, 2), build, s);
  }

  /** True when major (and, if both known, minor) match. */
  sameMajorMinor(other: PentahoVersion | null): boolean {
    if (other === null || this.major === null || other.major === null) return false;
    if (this.major !== other.major) return false;
    return this.minor === null || other.minor === null || this.minor === other.minor;
  }

  /** Java equals: same raw string. */
  equals(other: PentahoVersion | null): boolean {
    return other !== null && this.raw === other.raw;
  }

  toString(): string {
    return this.raw === null ? '(unknown)' : this.raw;
  }
}
