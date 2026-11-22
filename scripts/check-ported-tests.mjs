// Fails when a Java test of the reference modules has no TypeScript test titled after it.
// Ported tests keep the Java method name as their Vitest title (alone or as `name: detail`), so
// a missing name means a test was dropped during the port. The Java tests of tag v0.2.0 (the
// oracle; KtrDiffServerTest excluded, the HTTP server is not ported) are frozen in
// scripts/java-tests.txt: the Java engine no longer changes, and the check needs no Git tag.
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const TS_TEST_DIRS = ['packages/core/test', 'packages/cli/test'];

function filesUnder(dir, suffix) {
  const out = [];
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const path = join(dir, e.name);
    if (e.isDirectory()) out.push(...filesUnder(path, suffix));
    else if (e.isFile() && e.name.endsWith(suffix)) out.push(path);
  }
  return out;
}

// "Class method" per line, comments starting with #.
const javaTests = readFileSync(join(root, 'scripts', 'java-tests.txt'), 'utf8').split('\n')
  .filter((line) => line.trim() && !line.startsWith('#'))
  .map((line) => { const [className, name] = line.trim().split(/\s+/); return { name, where: `v0.2.0 ${className}` }; });

// Titles of it/test/describe calls (including .skip/.skipIf(...)/.each(...) forms); template
// literals count by their text, so a parameterised title still names its Java method.
const TS_TITLE = /\b(?:it|test|describe)(?:\.\w+(?:\([^)]*\))?)*\(\s*(['"`])((?:\\.|(?!\1).)*)\1/g;
const titles = new Set();
for (const dir of TS_TEST_DIRS) {
  for (const file of filesUnder(join(root, dir), '.test.ts')) {
    for (const m of readFileSync(file, 'utf8').matchAll(TS_TITLE)) titles.add(m[2]);
  }
}
// A title is the Java name, or starts with it followed by a separator (`name: what it checks`).
const ported = (name) => titles.has(name) || [...titles].some((t) => t.startsWith(name) && /^\W/.test(t.slice(name.length)));
const missing = javaTests.filter((t) => !ported(t.name));
if (javaTests.length === 0) {
  console.error('check-ported-tests: no Java test found (wrong paths?)');
  process.exit(1);
}
if (missing.length > 0) {
  console.error(`check-ported-tests: ${missing.length} of ${javaTests.length} Java tests have no TypeScript test titled after them:`);
  for (const t of missing) console.error(`  ${t.name}  — ${t.where}`);
  process.exit(1);
}
console.log(`check-ported-tests: OK (${javaTests.length} Java tests, all found among ${titles.size} TypeScript titles)`);
