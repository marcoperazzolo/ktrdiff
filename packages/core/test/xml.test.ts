import { describe, expect, it } from 'vitest';
import { ParseError } from '../src/xml/parse-error.ts';
import { DEFAULT_MAX_BYTES, parseXmlBytes, parseXmlString } from '../src/xml/secure-xml.ts';

function parseFailure(fn: () => unknown): ParseError {
  try {
    fn();
  } catch (e) {
    if (e instanceof ParseError) return e;
    throw e;
  }
  throw new Error('expected a ParseError');
}

// Ported from ktrdiff-core SecureXmlTest.
describe('SecureXml (ported)', () => {
  it('parsesPlainXml: elements, repeated children and paths', () => {
    const root = parseXmlString('<a><b>1</b><b>2</b><c/></a>');
    expect(root.name).toBe('a');
    expect(root.childrenNamed('b')).toHaveLength(2);
    expect(root.child('b')!.trimmedText()).toBe('1');
    expect(root.child('c')!.isSemanticallyEmpty()).toBe(true);
    expect(root.childrenNamed('b')[1]!.path).toBe('/a/b[2]');
  });

  it('rejectsInvalidXml: plain text is not XML', () => {
    expect(parseFailure(() => parseXmlString('This is not a valid XML document.')).code).toBe('invalid_xml');
  });

  it('rejectsTruncatedXml: unclosed elements', () => {
    expect(parseFailure(() => parseXmlString('<transformation><info><name>x</name>')).code).toBe('invalid_xml');
  });

  it('rejectsDoctypeDeclarations: internal subset with an external entity', () => {
    const evil = '<?xml version="1.0"?><!DOCTYPE foo [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><foo>&xxe;</foo>';
    const e = parseFailure(() => parseXmlString(evil));
    expect(e.code).toBe('invalid_xml');
    expect(e.message.toLowerCase()).toContain('well-formed');
  });

  it('rejectsExternalDtdReference: DOCTYPE with a SYSTEM id', () => {
    const evil = '<?xml version="1.0"?><!DOCTYPE foo SYSTEM "http://evil.example/x.dtd"><foo/>';
    expect(() => parseXmlString(evil)).toThrow(ParseError);
  });

  it('enforcesSizeLimit: content longer than maxBytes', () => {
    const e = parseFailure(() => parseXmlString(`<a>${'x'.repeat(200)}</a>`, { maxBytes: 64, maxDepth: 100 }));
    expect(e.code).toBe('file_too_large');
  });

  it('enforcesDepthLimit: nesting deeper than maxDepth', () => {
    const xml = `${'<n>'.repeat(50)}x${'</n>'.repeat(50)}`;
    const e = parseFailure(() => parseXmlString(xml, { maxBytes: DEFAULT_MAX_BYTES, maxDepth: 10 }));
    expect(e.code).toBe('invalid_xml');
    expect(e.message).toContain('depth');
  });

  it('emptyDocumentIsInvalid: whitespace only', () => {
    expect(parseFailure(() => parseXmlString('   ')).code).toBe('invalid_xml');
  });
});

describe('xml tree conversion', () => {
  it('builds root and child paths with per-tag 1-based counters', () => {
    const root = parseXmlString('<t><step><name>a</name></step><hop/><step><name>b</name></step></t>');
    expect(root.path).toBe('/t');
    expect(root.children.map((c) => c.path)).toEqual(['/t/step[1]', '/t/hop[1]', '/t/step[2]']);
    expect(root.children[2]!.child('name')!.path).toBe('/t/step[2]/name[1]');
  });

  it('orders attributes by name like the Xerces NamedNodeMap', () => {
    const root = parseXmlString('<a zeta="1" Beta="2" alpha="3" _x="4"/>');
    expect([...root.attributes.keys()]).toEqual(['Beta', '_x', 'alpha', 'zeta']);
  });

  it('drops whitespace-only text next to children but keeps meaningful mixed text', () => {
    expect(parseXmlString('<a>\n  <b/>\n</a>').text).toBe('');
    expect(parseXmlString('<a> x <b/></a>').text).toBe(' x ');
    expect(parseXmlString('<a>  </a>').text).toBe('  ');
    // NBSP is not Java-trim whitespace, so it is content.
    expect(parseXmlString('<a> <b/></a>').text).toBe(' ');
  });

  it('concatenates text and CDATA, drops comments and PIs', () => {
    const root = parseXmlString('<sql>SELECT <!-- c --><![CDATA[a < b && c]]><?pi data?> &amp; 1</sql>');
    expect(root.text).toBe('SELECT a < b && c & 1');
  });

  it('resolves predefined entities and character references', () => {
    expect(parseXmlString('<a>&lt;&gt;&amp;&apos;&quot;&#65;&#x42;&#x1F600;</a>').text).toBe('<>&\'"AB\u{1F600}');
  });

  it('normalizes line ends but keeps a CR written as a reference', () => {
    expect(parseXmlString('<a>x\r\ny\rz&#13;</a>').text).toBe('x\ny\nz\r');
  });

  it('normalizes literal whitespace in attribute values but keeps references', () => {
    const root = parseXmlString('<a v="x\ty\r\nz&#9;w&#10;"/>');
    expect(root.attributes.get('v')).toBe('x y z\tw\n');
  });

  it('accepts an XML declaration, comments and PIs around the root', () => {
    const doc = '<?xml version="1.0" encoding="ISO-8859-1" standalone="yes"?>\n<!-- c -->\n<?pi x?>\n<a/>\n<!-- end -->\n';
    expect(parseXmlString(doc).name).toBe('a');
  });

  it('keeps non-ASCII names and values', () => {
    const root = parseXmlString('<àbc dé="ü">漢字 😀</àbc>');
    expect(root.name).toBe('àbc');
    expect(root.attributes.get('dé')).toBe('ü');
    expect(root.text).toBe('漢字 😀');
  });

  it('decodes bytes as UTF-8, checks the byte size first and rejects a kept BOM like Xerces', () => {
    const bytes = new Uint8Array([0x3c, 0x61, 0x3e, 0xc3, 0xa8, 0x3c, 0x2f, 0x61, 0x3e]);
    expect(parseXmlBytes(bytes).text).toBe('è');
    expect(parseFailure(() => parseXmlBytes(bytes, { maxBytes: 8 })).code).toBe('file_too_large');
    const bom = new Uint8Array([0xef, 0xbb, 0xbf, 0x3c, 0x61, 0x2f, 0x3e]);
    expect(parseFailure(() => parseXmlBytes(bom)).code).toBe('invalid_xml');
  });

  it('rejects documents above the element-count limit (D3)', () => {
    const xml = `<a>${'<b/>'.repeat(10)}</a>`;
    expect(parseXmlString(xml, { maxElements: 11 }).children).toHaveLength(10);
    expect(parseFailure(() => parseXmlString(xml, { maxElements: 10 })).code).toBe('invalid_xml');
  });

  it('accepts depth exactly at the limit', () => {
    const xml = `${'<n>'.repeat(10)}${'</n>'.repeat(10)}`;
    expect(parseXmlString(xml, { maxDepth: 10 }).name).toBe('n');
    expect(parseFailure(() => parseXmlString(xml, { maxDepth: 9 })).code).toBe('invalid_xml');
  });

  it.each([
    ['DOCTYPE', '<!DOCTYPE a><a/>'],
    ['undefined entity', '<a>&undefined;</a>'],
    ['bare ampersand', '<a>x & y</a>'],
    ['reference without semicolon', '<a>&amp</a>'],
    ['mismatched tag', '<a><b></a></b>'],
    ['unclosed tag', '<a><b>'],
    ['duplicate attribute', '<a x="1" x="2"/>'],
    ['lt in attribute', '<a x="<"/>'],
    ['unquoted attribute', '<a x=1/>'],
    ['missing space between attributes', '<a x="1"y="2"/>'],
    [']]> in text', '<a>x]]>y</a>'],
    ['invalid char reference', '<a>&#1;</a>'],
    ['char reference out of range', '<a>&#x110000;</a>'],
    ['surrogate char reference', '<a>&#xD800;</a>'],
    ['empty char reference', '<a>&#;</a>'],
    ['raw control character', '<a>\u0001</a>'],
    ['raw U+FFFE', '<a>￾</a>'],
    ['lone surrogate', '<a>\ud800</a>'],
    ['two roots', '<a/><b/>'],
    ['text after root', '<a/>x'],
    ['no root', '<!-- only a comment -->'],
    ['text before root', 'x<a/>'],
    ['unterminated comment', '<a><!-- x</a>'],
    ['double dash in comment', '<a><!-- x -- y --></a>'],
    ['unterminated CDATA', '<a><![CDATA[x</a>'],
    ['CDATA outside root', '<![CDATA[x]]><a/>'],
    ['XML declaration not first', ' <?xml version="1.0"?><a/>'],
    ['reserved PI target', '<a><?XmL x?></a>'],
    ['unsupported version', '<?xml version="2.0"?><a/>'],
    ['bad standalone', '<?xml version="1.0" standalone="maybe"?><a/>'],
    ['leading BOM', '﻿<a/>'],
    ['end tag with attributes', '<a></a x="1">'],
    ['unknown markup declaration', '<a><!ELEMENT a ANY></a>'],
    ['invalid name start', '<1a/>'],
  ])('rejects malformed XML: %s', (_label, xml) => {
    expect(parseFailure(() => parseXmlString(xml)).code).toBe('invalid_xml');
  });
});
