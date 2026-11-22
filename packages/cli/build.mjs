// Bundles the CLI and @ktrdiff/core into one dependency-free file: dist/ktrdiff.mjs.
// Unminified on purpose (auditable); legal comments inline keep the Apache-2.0 notice of the
// ported Myers diff.
import { build } from 'esbuild';
import { statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const outfile = join(here, 'dist', 'ktrdiff.mjs');

await build({
  entryPoints: [join(here, 'src', 'main.ts')],
  outfile,
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  external: [],
  legalComments: 'inline',
  minify: false,
  logLevel: 'warning',
  // yaml's CommonJS build requires node builtins; an ESM bundle only gets `require` this way.
  banner: {
    js: "#!/usr/bin/env node\nimport { createRequire as __ktrdiffCreateRequire } from 'node:module';\n"
      + 'const require = __ktrdiffCreateRequire(import.meta.url);',
  },
});

console.log(`ktrdiff: wrote ${outfile} (${statSync(outfile).size} bytes)`);
