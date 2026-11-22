// Text and HTML renderers: behaviour the parity references do not exercise (they are byte-checked
// against the oracle in parity.test.ts).
import { describe, expect, it } from 'vitest';
import { advancedConfig, compareDocuments, defaultConfig, renderHtml, renderText } from '../src/index.ts';
import { esc } from '../src/render/html.ts';
import * as K from './support/ktrs.ts';

const compare = (before: string, after: string) => compareDocuments(
  { name: 'before.ktr', content: K.transformation('demo', before) },
  { name: 'after.ktr', content: K.transformation('demo', after) },
  advancedConfig());

describe('renderers', () => {
  it('escapes the five HTML-significant characters like HtmlRenderer.esc', () => {
    expect(esc(`<a href="x">'&'</a>`)).toBe('&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;');
    expect(esc(null)).toBe('');
  });

  it('never lets a step name inject markup into the HTML report', () => {
    const cs = compare(K.dummyStep('A', 0, 0), K.dummyStep('A', 0, 0) + K.dummyStep('&lt;img src=x&gt;', 10, 0));
    const html = renderHtml(cs, advancedConfig());
    expect(html).toContain('&lt;img src=x&gt;');
    expect(html).not.toContain('<img src=x>');
  });

  it('groups a hop whose target changed and prints the hidden summary in quick mode', () => {
    const steps = K.dummyStep('A', 0, 0) + K.dummyStep('B', 10, 0) + K.dummyStep('C', 20, 0);
    const before = K.order(K.hop('A', 'B')) + steps;
    const after = K.order(K.hop('A', 'C')) + steps.replace('<xloc>0<', '<xloc>5<');
    const text = renderText(compare(before, after), defaultConfig());
    expect(text).toContain('HOP TARGET CHANGED\n  A\n  - B\n  + C\n');
    expect(text).toContain('HIDDEN BY QUICK MODE\n  1 layout change\n');
  });
});
