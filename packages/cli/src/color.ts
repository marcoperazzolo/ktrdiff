// ANSI colours for the text reports printed on a terminal. They are applied to the rendered text,
// line by line, so the core renderers and their oracle parity stay untouched: section headings
// are upper-case lines at column 0, diff lines start with `- ` / `+ ` after the indentation.

import { CliError } from './io.ts';

export type ColorMode = 'auto' | 'always' | 'never';

const ESC = '\u001b[';
const RESET = ESC + '0m';
const paint = (codes: string, text: string): string => ESC + codes + 'm' + text + RESET;

const RED = '31';
const GREEN = '32';
const YELLOW = '33';
const MAGENTA = '35';
const CYAN = '36';
// Bright blue: plain blue is hard to read on the dark backgrounds most terminals use.
const BLUE = '94';
const BOLD = '1';
const DIM = '2';

export function parseColorMode(value: string | undefined): ColorMode {
  const mode = (value ?? 'auto').toLowerCase();
  if (mode === 'auto' || mode === 'always' || mode === 'never') return mode;
  throw new CliError('Unknown --color value: ' + value + ' (use auto, always or never)');
}

/** `auto` colours only a terminal that accepts them (see nodeIo: TTY, NO_COLOR, TERM=dumb). */
export function useColor(mode: ColorMode, terminal: boolean | undefined): boolean {
  return mode === 'always' || (mode === 'auto' && terminal === true);
}

/** Colour of a change heading from its action word; other headings are only bold. */
function headingColor(heading: string): string {
  if (heading.startsWith('ERROR')) return RED;
  if (heading.startsWith('WARNING') || heading.startsWith('UNKNOWN')) return MAGENTA;
  if (heading.startsWith('HIDDEN BY')) return DIM;
  if (/\bADDED\b/.test(heading)) return GREEN;
  if (/\bREMOVED\b/.test(heading)) return RED;
  if (/\bRENAMED\b/.test(heading)) return BLUE;
  if (/\bMOVED\b/.test(heading)) return CYAN;
  if (/\b(MODIFIED|CHANGED)\b/.test(heading)) return YELLOW;
  return '';
}

const FILE_STATUS: Readonly<Record<string, string>> = {
  ADDED: GREEN, REMOVED: RED, RENAMED: BLUE, MODIFIED: YELLOW, UNCHANGED: DIM, ERROR: RED,
};

function colorLine(line: string): string {
  // Directory report: `STATUS  path` introduces each file.
  const file = /^(ADDED|REMOVED|RENAMED|MODIFIED|UNCHANGED|ERROR)( {2}.*)$/.exec(line);
  if (file) return paint(BOLD + ';' + FILE_STATUS[file[1]!], file[1]!) + paint(BOLD, file[2]!);
  if (/^[A-Z]{2,}(?: [A-Z]+)*(?: \(.*\))?$/.test(line)) {
    const color = headingColor(line);
    return paint(color === '' ? BOLD : BOLD + ';' + color, line);
  }
  if (/^(?:Transformation|Result): /.test(line) || line === 'Summary') return paint(BOLD, line);
  if (line.startsWith('WARNING: ')) return paint(MAGENTA, line);
  const diff = /^(\s+)([-+]) (.*)$/.exec(line);
  if (diff) return diff[1]! + paint(diff[2] === '-' ? RED : GREEN, diff[2]! + ' ' + diff[3]!);
  const rename = /^(\s+)(renamed to: .*)$/.exec(line);
  if (rename) return rename[1]! + paint(BLUE, rename[2]!);
  return line;
}

export function colorizeReport(text: string): string {
  return text.split('\n').map((line) => (line === '' ? line : colorLine(line))).join('\n');
}
