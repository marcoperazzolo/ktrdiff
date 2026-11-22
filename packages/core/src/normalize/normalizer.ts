// it.ktrdiff.core.normalize.Normalizer — explicit, testable normalization rules:
// newlines become \n for text comparison (originals are kept for rendering); an element with no
// attributes, children or non-blank text equals an absent one (Spoon adds e.g. an empty
// <row-meta/> on re-save); canonical serialization keeps document order (order is only ignored
// where the engine matches collections by key); normalization is idempotent.

import { compareUtf16, javaIsLetterOrDigit, javaIsWhitespace, javaTrim } from '../util/java.ts';
import { sha256Hex } from '../util/sha256.ts';
import type { XmlNode } from '../xml/xml-node.ts';
import { isSecretProperty, REDACTED } from './secret-redactor.ts';

/** Normalize newlines to \n. Idempotent. */
export function normalizeText(s: string): string;
export function normalizeText(s: string | null): string | null;
export function normalizeText(s: string | null): string | null {
  if (s === null) return null;
  return s.replaceAll('\r\n', '\n').replaceAll('\r', '\n');
}

/** Normalized text with surrounding whitespace trimmed (Java trim). */
export function normalizeTrimmed(s: string): string;
export function normalizeTrimmed(s: string | null): string | null;
export function normalizeTrimmed(s: string | null): string | null {
  const n = normalizeText(s);
  return n === null ? null : javaTrim(n);
}

/** True when both values are semantically the same text (newline-insensitive). */
export function sameText(a: string | null, b: string | null): boolean {
  const na = normalizeText(a);
  const nb = normalizeText(b);
  if (na === null) return nb === null;
  return na === nb;
}

/** Conservative token equality: whitespace inside literals/comments is never discarded. */
export function sameIgnoringWhitespace(a: string | null, b: string | null): boolean {
  if (a === null || b === null) return a === null && b === null;
  // Dialects can use dollar-quoted bodies/identifiers. Without a dialect parser, prefer a
  // functional change over incorrectly hiding literal content as formatting noise.
  if (a.includes('$') || b.includes('$')) return sameText(a, b);
  const ta = tokens(a);
  const tb = tokens(b);
  if (ta.length !== tb.length) return false;
  for (let i = 0; i < ta.length; i++) {
    if (ta[i] !== tb[i]) return false;
  }
  return true;
}

const OPERATORS = ['===', '!==', '==', '!=', '<=', '>=', '<>', '++', '&&', '||', '=>'];

function tokens(input: string): string[] {
  const text = normalizeText(input);
  const out: string[] = [];
  // An iterative scanner avoids regex backtracking on large literal bodies.
  let i = 0;
  while (i < text.length) {
    const c = text.charCodeAt(i);
    if (javaIsWhitespace(c)) {
      i++;
      continue;
    }
    const start = i++;
    const ch = text[start]!;
    if (ch === '\'' || ch === '"' || ch === '`' || ch === '[') {
      const end = ch === '[' ? ']' : ch;
      while (i < text.length) {
        const next = text[i++]!;
        if (next === '\\' && i < text.length) {
          i++;
          continue;
        }
        if (next === end) {
          if (i < text.length && text[i] === end) {
            i++;
            continue;
          }
          break;
        }
      }
    } else if (text.startsWith('--', start) || text.startsWith('//', start)) {
      while (i < text.length && text[i] !== '\n') i++;
    } else if (text.startsWith('/*', start)) {
      const end = text.indexOf('*/', i + 1);
      i = end < 0 ? text.length : end + 2;
    } else if (isWord(c)) {
      while (i < text.length && isWord(text.charCodeAt(i))) i++;
    } else {
      for (const operator of OPERATORS) {
        if (text.startsWith(operator, start)) {
          i = start + operator.length;
          break;
        }
      }
    }
    out.push(text.substring(start, i));
  }
  return out;
}

function isWord(code: number): boolean {
  return javaIsLetterOrDigit(code) || code === 0x5f /* _ */ || code === 0x24 /* $ */;
}

/**
 * Canonical serialization of an element subtree for fingerprinting and semantic equality.
 * Top-level children named in `excludedChildren` are skipped (drops <name> and <GUI> when
 * fingerprinting steps). Semantically empty elements collapse to nothing so "empty" and
 * "absent" fingerprints match.
 */
export function canonical(node: XmlNode, excludedChildren: ReadonlySet<string> | null): string {
  const sb: string[] = [];
  appendCanonical(sb, node, excludedChildren, true, false, false);
  return sb.join('');
}

/** Safe representation for reports; never use this for equality or fingerprints. */
export function redactedCanonical(node: XmlNode): string {
  const sb: string[] = [];
  appendCanonical(sb, node, null, true, true, false);
  return sb.join('');
}

function appendCanonical(sb: string[], node: XmlNode, excluded: ReadonlySet<string> | null, top: boolean,
  redact: boolean, secretAncestor: boolean): void {
  if (node.isSemanticallyEmpty()) return;
  sb.push('<', node.name);
  const secret = secretAncestor || isSecretProperty(node.name)
    || isSecretProperty(node.childText('code'))
    || isSecretProperty(node.childText('name'));
  const keys = [...node.attributes.keys()].sort(compareUtf16);
  for (const key of keys) {
    const value = redact && (secret || isSecretProperty(key)) ? REDACTED : node.attributes.get(key)!;
    sb.push(' ', key, '="', escape(value), '"');
  }
  sb.push('>');
  const text = normalizeTrimmed(node.text);
  if (text.length > 0) sb.push(escape(redact && secret ? REDACTED : text));
  for (const c of node.children) {
    if (top && excluded !== null && excluded.has(c.name)) continue;
    appendCanonical(sb, c, null, false, redact, secret);
  }
  sb.push('</', node.name, '>');
}

function escape(text: string): string {
  return text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

/** SHA-256 lowercase hex of the UTF-8 canonical serialization. */
export function fingerprint(node: XmlNode, excludedChildren: ReadonlySet<string> | null): string {
  return sha256Hex(canonical(node, excludedChildren));
}
