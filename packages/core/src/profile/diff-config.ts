// it.ktrdiff.core.profile.DiffConfig, Mode — effective comparison/presentation configuration.
// Plain immutable data (structured-cloneable, so it can cross a Web Worker boundary); "setters"
// are object spreads. Only presentation options depend on the mode: sqlIgnoreFormatting and
// scriptsIgnoreWhitespace influence how a detected change is classified, never whether it is
// detected.

import { CLASSIFICATIONS, type Classification } from '../model/change.ts';

/** Presentation mode. Modes filter a complete ChangeSet; they never affect detection. */
export type Mode = 'quick' | 'advanced' | 'custom';

export const MODES: readonly Mode[] = ['quick', 'advanced', 'custom'];

/** Mode.fromId: `equalsIgnoreCase` against the ids, IllegalArgumentException text kept. */
export function modeFromId(id: string): Mode {
  for (const m of MODES) {
    if (javaEqualsIgnoreCase(m, id)) return m;
  }
  throw new Error('Unknown mode: ' + id + ' (use quick, advanced or custom)');
}

/**
 * `String.equalsIgnoreCase`: per UTF-16 unit, equal after upper-casing or after upper- then
 * lower-casing. JS case mappings that expand to several characters (e.g. U+00DF) are ignored,
 * because Java's Character.toUpperCase(char) maps such units to themselves.
 */
function javaEqualsIgnoreCase(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const c1 = a.charAt(i);
    const c2 = b.charAt(i);
    if (c1 === c2) continue;
    const u1 = upperUnit(c1);
    const u2 = upperUnit(c2);
    if (u1 === u2) continue;
    if (lowerUnit(u1) === lowerUnit(u2)) continue;
    return false;
  }
  return true;
}

function upperUnit(c: string): string {
  const u = c.toUpperCase();
  return u.length === 1 ? u : c;
}

function lowerUnit(c: string): string {
  const l = c.toLowerCase();
  return l.length === 1 ? l : c;
}

/** `none | any | functional | unknown`; kept as a string like the Java field. */
export type FailOn = string;

export interface DiffConfig {
  readonly mode: Mode;
  /** Custom-mode inclusion per classification. Presets ignore this map. */
  readonly include: Readonly<Record<Classification, boolean>>;
  readonly layoutStepPositions: boolean;
  readonly layoutNotePositions: boolean;
  readonly notesContent: boolean;
  readonly sqlIgnoreFormatting: boolean;
  readonly scriptsIgnoreWhitespace: boolean;
  readonly showXmlPaths: boolean;
  readonly showRawDiff: boolean;
  /** Custom-mode toggle: renames stay detected and identity-preserving, but can be hidden. */
  readonly showRenames: boolean;
  readonly renameThreshold: number;
  readonly failOn: FailOn;
  readonly maxFileBytes: number;
  readonly verbose: boolean;
}

/** DiffConfig.defaults(): Quick mode, every classification included except layout. */
export function defaultConfig(): DiffConfig {
  const include = {} as Record<Classification, boolean>;
  for (const c of CLASSIFICATIONS) include[c] = true;
  include.layout = false;
  return {
    mode: 'quick',
    include,
    layoutStepPositions: false,
    layoutNotePositions: false,
    notesContent: true,
    sqlIgnoreFormatting: true,
    scriptsIgnoreWhitespace: false,
    showXmlPaths: false,
    showRawDiff: false,
    showRenames: true,
    renameThreshold: 0.70,
    failOn: 'none',
    maxFileBytes: 50 * 1024 * 1024,
    verbose: false,
  };
}

/** DiffConfig.advanced(). */
export function advancedConfig(): DiffConfig {
  return { ...defaultConfig(), mode: 'advanced' };
}

/** DiffConfig.includes(c): absent entries count as excluded (Boolean.TRUE.equals). */
export function includes(config: DiffConfig, c: Classification): boolean {
  return config.include[c] === true;
}

/** DiffConfig.include(c, value) as a copy. */
export function withInclude(config: DiffConfig, c: Classification, value: boolean): DiffConfig {
  return { ...config, include: { ...config.include, [c]: value } };
}
