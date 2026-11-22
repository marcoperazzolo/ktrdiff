import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Absolute project roots, so the config also works when Vitest starts in a package folder
// (`npm test -w @ktrdiff/cli`).
const here = (path: string): string => fileURLToPath(new URL(path, import.meta.url));

// One project per package so `npm test` can pick them explicitly; private-parity is opt-in
// (`npm run parity:private`) because it needs the owner's local documents.
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'core',
          root: here('./packages/core'),
          include: ['test/**/*.test.ts'],
          exclude: ['test/private-parity.test.ts'],
        },
      },
      {
        test: {
          name: 'private-parity',
          root: here('./packages/core'),
          include: ['test/private-parity.test.ts'],
        },
      },
      {
        test: {
          name: 'cli',
          root: here('./packages/cli'),
          include: ['test/**/*.test.ts'],
          passWithNoTests: true,
        },
      },
    ],
  },
});
