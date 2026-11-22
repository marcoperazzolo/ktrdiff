// Java String semantics needed by the CLI (core keeps its own helpers internal).

/** String.trim(): strips code units <= U+0020 only (JS trim() also strips NBSP, U+2028, BOM…). */
export function javaTrim(s: string): string {
  let start = 0;
  let end = s.length;
  while (start < end && s.charCodeAt(start) <= 0x20) start++;
  while (end > start && s.charCodeAt(end - 1) <= 0x20) end--;
  return s.substring(start, end);
}
