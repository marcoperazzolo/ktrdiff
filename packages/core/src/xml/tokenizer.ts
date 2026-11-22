// Minimal strict XML 1.0 tokenizer, replacing the hardened Xerces parser of the Java engine.
// KTR/KJB/KDB need no DTD, so DOCTYPE and any non-predefined entity are rejected outright:
// nothing is ever declared, resolved or fetched. Accept/reject verdicts follow Xerces (checked
// against the malformed probes); error wording does not (intentional difference D1).
//
// Handled: XML declaration (first thing only, encoding ignored: input is already decoded),
// elements, attributes (quoted, unique, no '<', value normalization), text, CDATA, comments,
// PIs, the five predefined entities, character references validated against the Char
// production, XML 1.0 5th edition names, line-end normalization, a single root with only
// whitespace/comments/PIs around it, ']]>' forbidden in text.

import { notWellFormed } from './parse-error.ts';

export interface XmlHandler {
  startElement(name: string, attributes: ReadonlyArray<readonly [string, string]>): void;
  /** Character data or CDATA content, with references already replaced. */
  text(value: string): void;
  endElement(name: string): void;
}

const NAME_START = ':A-Z_a-z\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u02FF\\u0370-\\u037D\\u037F-\\u1FFF'
  + '\\u200C-\\u200D\\u2070-\\u218F\\u2C00-\\u2FEF\\u3001-\\uD7FF\\uF900-\\uFDCF\\uFDF0-\\uFFFD\\u{10000}-\\u{EFFFF}';
const NAME_REST = `${NAME_START}\\-.0-9\\u00B7\\u0300-\\u036F\\u203F-\\u2040`;
const NAME_SOURCE = `[${NAME_START}][${NAME_REST}]*`;

const PREDEFINED_ENTITIES: ReadonlyMap<string, string> = new Map([
  ['lt', '<'], ['gt', '>'], ['amp', '&'], ['apos', "'"], ['quot', '"'],
]);

/** XML S production (CR is already normalized away, kept for safety). */
function isSpace(code: number): boolean {
  return code === 0x20 || code === 0x0a || code === 0x09 || code === 0x0d;
}

/** XML Char production for a code point. */
function isXmlChar(cp: number): boolean {
  return cp === 0x09 || cp === 0x0a || cp === 0x0d || (cp >= 0x20 && cp <= 0xd7ff)
    || (cp >= 0xe000 && cp <= 0xfffd) || (cp >= 0x10000 && cp <= 0x10ffff);
}

/** Rejects any code unit sequence outside the Char production (controls, lone surrogates, U+FFFE/F). */
function checkCharacters(s: string): void {
  for (let i = 0; i < s.length; i++) {
    const code = s.charCodeAt(i);
    if (code >= 0x20 && code < 0xd800) continue;
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = i + 1 < s.length ? s.charCodeAt(i + 1) : 0;
      if (next >= 0xdc00 && next <= 0xdfff) { i++; continue; }
    } else if (isXmlChar(code)) {
      continue;
    }
    throw notWellFormed(`an invalid XML character (Unicode: 0x${code.toString(16)}) was found`);
  }
}

/** Parses `input` and reports its elements and text to `handler`; throws ParseError (invalid_xml). */
export function tokenize(input: string, handler: XmlHandler): void {
  // Line ends are normalized before parsing, so a &#13; reference still yields a CR.
  const s = input.includes('\r') ? input.replace(/\r\n?/g, '\n') : input;
  checkCharacters(s);
  // A fresh sticky regex per call: no module state is mutated.
  const nameRegex = new RegExp(NAME_SOURCE, 'uy');
  const n = s.length;
  let pos = 0;

  const matchName = (at: number): string | null => {
    nameRegex.lastIndex = at;
    const m = nameRegex.exec(s);
    return m === null ? null : m[0];
  };
  const skipSpaces = (): boolean => {
    const start = pos;
    while (pos < n && isSpace(s.charCodeAt(pos))) pos++;
    return pos > start;
  };
  const unterminated = (): Error => notWellFormed('XML document structures must start and end within the same entity');

  const parseReference = (): string => {
    // s[pos] === '&'
    if (s.charCodeAt(pos + 1) === 0x23 /* # */) {
      const hex = s.charCodeAt(pos + 2) === 0x78 /* x */;
      let p = pos + (hex ? 3 : 2);
      const digitsStart = p;
      let cp = 0;
      for (; p < n; p++) {
        const c = s.charCodeAt(p);
        let digit: number;
        if (c >= 0x30 && c <= 0x39) digit = c - 0x30;
        else if (hex && c >= 0x61 && c <= 0x66) digit = c - 0x57;
        else if (hex && c >= 0x41 && c <= 0x46) digit = c - 0x37;
        else break;
        cp = cp * (hex ? 16 : 10) + digit;
        if (cp > 0x10ffff) cp = 0x110000; // stays invalid without overflowing
      }
      if (p === digitsStart || s.charCodeAt(p) !== 0x3b /* ; */) {
        throw notWellFormed('a character reference must end with the \';\' delimiter');
      }
      if (!isXmlChar(cp)) {
        throw notWellFormed(`character reference "${s.substring(pos, p)}" is an invalid XML character`);
      }
      pos = p + 1;
      return String.fromCodePoint(cp);
    }
    const name = matchName(pos + 1);
    if (name === null) throw notWellFormed('the entity name must immediately follow the \'&\' in the entity reference');
    const end = pos + 1 + name.length;
    if (s.charCodeAt(end) !== 0x3b) throw notWellFormed(`the reference to entity "${name}" must end with the ';' delimiter`);
    const value = PREDEFINED_ENTITIES.get(name);
    if (value === undefined) throw notWellFormed(`the entity "${name}" was referenced, but not declared`);
    pos = end + 1;
    return value;
  };

  const expectEq = (): void => {
    skipSpaces();
    if (s.charCodeAt(pos) !== 0x3d /* = */) throw notWellFormed('the "=" character is expected');
    pos++;
    skipSpaces();
  };

  const quotedLiteral = (): string => {
    const quote = s.charCodeAt(pos);
    if (quote !== 0x22 && quote !== 0x27) throw notWellFormed('an open quote is expected');
    const end = s.indexOf(quote === 0x22 ? '"' : "'", pos + 1);
    if (end < 0) throw unterminated();
    const value = s.substring(pos + 1, end);
    pos = end + 1;
    return value;
  };

  const parseXmlDeclaration = (): void => {
    pos = 5; // after '<?xml', followed by a space
    skipSpaces();
    if (!s.startsWith('version', pos)) throw notWellFormed('the version is required in the XML declaration');
    pos += 7;
    expectEq();
    const version = quotedLiteral();
    if (version !== '1.0' && version !== '1.1') throw notWellFormed(`XML version "${version}" is not supported`);
    let spaced = skipSpaces();
    if (spaced && s.startsWith('encoding', pos)) {
      pos += 8;
      expectEq();
      // The declared encoding is ignored: bytes were decoded as UTF-8 (like the Java engine).
      if (!/^[A-Za-z][A-Za-z0-9._-]*$/.test(quotedLiteral())) throw notWellFormed('invalid encoding name');
      spaced = skipSpaces();
    }
    if (spaced && s.startsWith('standalone', pos)) {
      pos += 10;
      expectEq();
      const standalone = quotedLiteral();
      if (standalone !== 'yes' && standalone !== 'no') throw notWellFormed('standalone must be "yes" or "no"');
      skipSpaces();
    }
    if (!s.startsWith('?>', pos)) throw notWellFormed('the XML declaration must end with "?>"');
    pos += 2;
  };

  const parseComment = (): void => {
    // s starts with '<!--' at pos
    const dashes = s.indexOf('--', pos + 4);
    if (dashes < 0) throw unterminated();
    if (s.charCodeAt(dashes + 2) !== 0x3e /* > */) throw notWellFormed('the string "--" is not permitted within comments');
    pos = dashes + 3;
  };

  const parseProcessingInstruction = (): void => {
    // s starts with '<?' at pos
    const target = matchName(pos + 2);
    if (target === null) throw notWellFormed('the processing instruction must begin with the name of the target');
    if (target.toLowerCase() === 'xml') {
      throw notWellFormed('the processing instruction target matching "[xX][mM][lL]" is not allowed');
    }
    pos += 2 + target.length;
    if (s.startsWith('?>', pos)) { pos += 2; return; }
    if (!skipSpaces()) throw notWellFormed('white space is required between the processing instruction target and data');
    const end = s.indexOf('?>', pos);
    if (end < 0) throw unterminated();
    pos = end + 2;
  };

  /** Comments, PIs and whitespace outside the root; returns false at anything else. */
  const parseMisc = (): boolean => {
    if (skipSpaces()) return true;
    if (s.startsWith('<!--', pos)) { parseComment(); return true; }
    if (s.startsWith('<?', pos)) { parseProcessingInstruction(); return true; }
    return false;
  };

  const openNames: string[] = [];

  /** Start tag at pos ('<' + name); an element that is not self-closed stays in openNames. */
  const parseStartTag = (): void => {
    const name = matchName(pos + 1);
    if (name === null) throw notWellFormed('the markup in the document must be well-formed');
    pos += 1 + name.length;
    const attributes: Array<readonly [string, string]> = [];
    const seen = new Set<string>();
    for (;;) {
      const spaced = skipSpaces();
      const c = s.charCodeAt(pos);
      if (c === 0x3e /* > */) {
        pos++;
        handler.startElement(name, attributes);
        openNames.push(name);
        return;
      }
      if (c === 0x2f /* / */ && s.charCodeAt(pos + 1) === 0x3e) {
        pos += 2;
        handler.startElement(name, attributes);
        handler.endElement(name);
        return;
      }
      if (pos >= n) throw unterminated();
      const attrName = spaced ? matchName(pos) : null;
      if (attrName === null) {
        throw notWellFormed(`element type "${name}" must be followed by either attribute specifications, ">" or "/>"`);
      }
      pos += attrName.length;
      skipSpaces();
      if (s.charCodeAt(pos) !== 0x3d) throw notWellFormed(`attribute name "${attrName}" must be followed by the "=" character`);
      pos++;
      skipSpaces();
      const quote = s.charCodeAt(pos);
      if (quote !== 0x22 && quote !== 0x27) throw notWellFormed(`open quote is expected for attribute "${attrName}"`);
      pos++;
      const parts: string[] = [];
      let runStart = pos;
      for (;;) {
        if (pos >= n) throw unterminated();
        const v = s.charCodeAt(pos);
        if (v === quote) break;
        if (v === 0x3c /* < */) throw notWellFormed(`the value of attribute "${attrName}" must not contain the '<' character`);
        if (v === 0x26 /* & */) {
          parts.push(s.substring(runStart, pos));
          parts.push(parseReference()); // references are kept as their character, not normalized
          runStart = pos;
        } else if (v === 0x09 || v === 0x0a || v === 0x0d) {
          // Attribute-value normalization of literal whitespace characters.
          parts.push(s.substring(runStart, pos), ' ');
          pos++;
          runStart = pos;
        } else {
          pos++;
        }
      }
      parts.push(s.substring(runStart, pos));
      pos++;
      if (seen.has(attrName)) throw notWellFormed(`attribute "${attrName}" was already specified for element "${name}"`);
      seen.add(attrName);
      attributes.push([attrName, parts.join('')]);
    }
  };

  const parseEndTag = (): void => {
    const name = matchName(pos + 2);
    const open = openNames[openNames.length - 1]!;
    if (name === null || name !== open) {
      throw notWellFormed(`the element type "${open}" must be terminated by the matching end-tag "</${open}>"`);
    }
    pos += 2 + name.length;
    skipSpaces();
    if (s.charCodeAt(pos) !== 0x3e) throw notWellFormed(`the end-tag for element type "${name}" must end with a '>' delimiter`);
    pos++;
    openNames.pop();
    handler.endElement(name);
  };

  const parseText = (): void => {
    let runStart = pos;
    const flush = (): void => {
      if (pos > runStart) {
        const run = s.substring(runStart, pos);
        if (run.includes(']]>')) throw notWellFormed('the character sequence "]]>" must not appear in content');
        handler.text(run);
      }
    };
    while (pos < n) {
      const c = s.charCodeAt(pos);
      if (c === 0x3c) break;
      if (c === 0x26) {
        flush();
        handler.text(parseReference());
        runStart = pos;
      } else {
        pos++;
      }
    }
    flush();
  };

  // Prolog: optional XML declaration (only at offset 0), then Misc*; DOCTYPE is never allowed.
  if (s.startsWith('<?xml', 0) && isSpace(s.charCodeAt(5))) parseXmlDeclaration();
  while (pos < n && parseMisc()) { /* consumed */ }
  if (pos >= n) throw notWellFormed('premature end of file');
  if (s.startsWith('<!DOCTYPE', pos)) {
    throw notWellFormed('DOCTYPE is disallowed: document type declarations are never processed');
  }
  if (s.charCodeAt(pos) !== 0x3c || matchName(pos + 1) === null) {
    throw notWellFormed('content is not allowed in prolog');
  }

  parseStartTag();
  while (openNames.length > 0) {
    if (pos >= n) throw unterminated();
    if (s.charCodeAt(pos) !== 0x3c) { parseText(); continue; }
    if (s.charCodeAt(pos + 1) === 0x2f /* / */) parseEndTag();
    else if (s.startsWith('<!--', pos)) parseComment();
    else if (s.startsWith('<![CDATA[', pos)) {
      const end = s.indexOf(']]>', pos + 9);
      if (end < 0) throw unterminated();
      handler.text(s.substring(pos + 9, end));
      pos = end + 3;
    } else if (s.charCodeAt(pos + 1) === 0x3f /* ? */) parseProcessingInstruction();
    else if (s.charCodeAt(pos + 1) === 0x21 /* ! */) throw notWellFormed('the markup in the document must be well-formed');
    else parseStartTag();
  }

  // Trailing section: only Misc after the root element.
  while (pos < n) {
    if (parseMisc()) continue;
    if (s.charCodeAt(pos) === 0x3c) throw notWellFormed('the markup following the root element must be well-formed');
    throw notWellFormed('content is not allowed in trailing section');
  }
}
