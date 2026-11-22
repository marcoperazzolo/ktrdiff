import { describe, expect, it } from 'vitest';
import { canonicalStepType, sameStepType } from '../src/match/step-type-aliases.ts';
import { StepModel } from '../src/model/document.ts';
import {
  canonical, fingerprint, normalizeText, redactedCanonical, sameIgnoringWhitespace, sameText,
} from '../src/normalize/normalizer.ts';
import { isSecretProperty, redact, REDACTED } from '../src/normalize/secret-redactor.ts';
import { semanticSignature } from '../src/normalize/semantic-step.ts';
import { isVolatileInfoProperty } from '../src/normalize/volatile.ts';
import { parseXmlString } from '../src/xml/secure-xml.ts';

// Ported from ktrdiff-core NormalizerTest.
describe('Normalizer (ported)', () => {
  it('newlineNormalizationIsIdempotent', () => {
    const once = normalizeText('a\r\nb\rc\nd');
    expect(once).toBe('a\nb\nc\nd');
    expect(normalizeText(once)).toBe(once);
  });

  it('sameTextIgnoresNewlineStyle', () => {
    expect(sameText('SELECT 1\r\nFROM x', 'SELECT 1\nFROM x')).toBe(true);
    expect(sameText('SELECT 1', 'SELECT 2')).toBe(false);
  });

  it('whitespaceInsensitiveEquality', () => {
    expect(sameIgnoringWhitespace('SELECT  a,\n b', 'SELECT a, b')).toBe(true);
    expect(sameIgnoringWhitespace('SELECT a', 'SELECT b')).toBe(false);
    expect(sameIgnoringWhitespace("SELECT 'a b'", "SELECT 'ab'")).toBe(false);
    expect(sameIgnoringWhitespace('SELECT [a b]', 'SELECT [a  b]')).toBe(false);
    expect(sameIgnoringWhitespace('SELECT $$a b$$', 'SELECT $$a  b$$')).toBe(false);
    expect(sameIgnoringWhitespace('SELECT a b', 'SELECT ab')).toBe(false);
    expect(sameIgnoringWhitespace('a + +b', 'a++b')).toBe(false);
    expect(sameIgnoringWhitespace('SELECT 1 -- a b', 'SELECT 1 -- ab')).toBe(false);
    const literal = "'" + 'a'.repeat(20000) + " b'";
    expect(sameIgnoringWhitespace('SELECT ' + literal, 'SELECT\n' + literal)).toBe(true);
    expect(sameIgnoringWhitespace("SELECT 'unclosed a b", "SELECT 'unclosed ab")).toBe(false);
  });

  it('attributeOrderDoesNotMatterAndCanonicalCannotConfuseMarkupWithText', () => {
    expect(canonical(parseXmlString('<s a="1" b="2"/>'), null))
      .toBe(canonical(parseXmlString('<s b="2" a="1"/>'), null));
    expect(canonical(parseXmlString('<s>&lt;x&gt;1&lt;/x&gt;</s>'), null))
      .not.toBe(canonical(parseXmlString('<s><x>1</x></s>'), null));
  });

  it('emptyElementEqualsAbsentElement', () => {
    const withEmpty = parseXmlString('<step><a>1</a><row-meta/></step>');
    const without = parseXmlString('<step><a>1</a></step>');
    expect(canonical(withEmpty, new Set())).toBe(canonical(without, new Set()));
  });

  it('canonicalIgnoresIndentationAndSelfClosingStyle', () => {
    const a = parseXmlString('<s>\n  <t>v</t>\n  <e></e>\n</s>');
    const b = parseXmlString('<s><t>v</t><e/></s>');
    expect(canonical(a, null)).toBe(canonical(b, null));
  });

  it('fingerprintExcludesRequestedChildren', () => {
    const s1 = parseXmlString('<step><name>A</name><type>Dummy</type><GUI><xloc>1</xloc></GUI></step>');
    const s2 = parseXmlString('<step><name>B</name><type>Dummy</type><GUI><xloc>99</xloc></GUI></step>');
    const excludes = new Set(['name', 'GUI']);
    expect(fingerprint(s1, excludes)).toBe(fingerprint(s2, excludes));
    expect(fingerprint(s1, new Set())).not.toBe(fingerprint(s2, new Set()));
  });
});

// Ported from ktrdiff-core SecretRedactorTest.
describe('SecretRedactor (ported)', () => {
  it('passwordsAreRedacted', () => {
    expect(redact('password', 'Encrypted 2be98afc86aa7f2e4cb79ce10df90acde')).toBe(REDACTED);
    expect(redact('password', 'plaintext')).toBe(REDACTED);
    expect(redact('proxy_password', 'x')).toBe(REDACTED);
    expect(redact('proxyPassword', 'x')).toBe(REDACTED);
  });

  it('nonSecretsPassThrough', () => {
    expect(redact('username', 'demo_user')).toBe('demo_user');
    expect(redact('server', 'db.example')).toBe('db.example');
    expect(redact('type', 'MARIADB')).toBe('MARIADB');
  });

  it('nullSecretStaysNull', () => {
    expect(redact('password', null)).toBeNull();
  });
});

describe('normalize: TS-specific checks', () => {
  it('canonical output format, Java trim and lowercase hex fingerprint', () => {
    const node = parseXmlString('<s b="&quot;" a="1"><t> v </t><e/></s>');
    // Java trim keeps NBSP (> U+0020); attributes sorted by name; empty <e/> dropped.
    expect(canonical(node, null)).toBe('<s a="1" b="&quot;"><t> v</t></s>');
    expect(fingerprint(parseXmlString('<a/>'), null)).toMatch(/^[0-9a-f]{64}$/);
    // Fingerprint of the empty canonical string (empty element) is SHA-256("").
    expect(fingerprint(parseXmlString('<a/>'), null))
      .toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  });

  it('whitespace tokens use Java isWhitespace and isLetterOrDigit', () => {
    // NBSP is not Java whitespace: it is its own token, so removing it is a change.
    expect(sameIgnoringWhitespace('a b', 'a b')).toBe(false);
    expect(sameIgnoringWhitespace('caffè  x', 'caffè x')).toBe(true);
    expect(sameIgnoringWhitespace('a /* x y */ b', 'a /* x  y */ b')).toBe(false);
    expect(sameIgnoringWhitespace(null, null)).toBe(true);
    expect(sameIgnoringWhitespace('a', null)).toBe(false);
  });

  it('redactedCanonical hides secrets by element, code/name child and attribute', () => {
    const xml = parseXmlString('<connection><password>Encrypted 2be9</password>'
      + '<attribute><code>PROXY_PASSWORD</code><attribute>hunter2</attribute></attribute>'
      + '<x token="abc">keep</x></connection>');
    const out = redactedCanonical(xml);
    expect(out).not.toContain('2be9');
    expect(out).not.toContain('hunter2');
    expect(out).not.toContain('abc');
    expect(out).toContain('keep');
    expect(out).toContain(REDACTED);
  });

  it('secret and volatile property names', () => {
    for (const p of ['password', 'PASSWORD', 'sasPassword', 'my_passphrase_x', 'secretKey', 'secret_key',
      'token', 'auth_token', 'apiKey', 'API_KEY']) {
      expect(isSecretProperty(p), p).toBe(true);
    }
    for (const p of ['user', 'tokens', 'password_hint', 'keyword']) expect(isSecretProperty(p), p).toBe(false);
    expect(isSecretProperty(null)).toBe(false);
    expect(isVolatileInfoProperty('modified_date')).toBe(true);
    expect(isVolatileInfoProperty('description')).toBe(false);
  });

  it('step type aliases', () => {
    expect(canonicalStepType(' ModifiedJavaScriptValue ')).toBe('ScriptValueMod');
    expect(canonicalStepType('Dummy')).toBe('Dummy');
    expect(canonicalStepType(null)).toBeNull();
    expect(sameStepType('Modified Java Script Value', 'ScriptValueMod')).toBe(true);
    expect(sameStepType(null, null)).toBe(true);
    expect(sameStepType('A', null)).toBe(false);
  });

  it('semantic signature ignores name/GUI/description, property order and renamed references', () => {
    const a = parseXmlString('<step><name>A</name><type>ModifiedJavaScriptValue</type><description>d</description>'
      + '<p>1</p><q>2</q><send_true_to>Old</send_true_to><GUI><xloc>1</xloc></GUI></step>');
    const b = parseXmlString('<step><name>B</name><q>2</q><type>ScriptValueMod</type><p>1</p>'
      + '<send_true_to>New</send_true_to><empty/></step>');
    const sa = new StepModel('A', 'ModifiedJavaScriptValue', a, null, null);
    const sb = new StepModel('B', 'ScriptValueMod', b, null, null);
    expect(semanticSignature(sa, new Map([['Old', '#1']]))).toBe(semanticSignature(sb, new Map([['New', '#1']])));
    expect(semanticSignature(sa, new Map())).not.toBe(semanticSignature(sb, new Map()));
    // Repeated elements keep their order.
    const f1 = parseXmlString('<step><f>1</f><f>2</f></step>');
    const f2 = parseXmlString('<step><f>2</f><f>1</f></step>');
    expect(semanticSignature(new StepModel('x', 'T', f1, null, null), new Map()))
      .not.toBe(semanticSignature(new StepModel('x', 'T', f2, null, null), new Map()));
  });
});
