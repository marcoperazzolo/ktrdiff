// it.ktrdiff.core.fixtures.FixtureLoader: discovers fixture directories and parses expected.yml.

import { readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { isDirectory, isRegularFile } from '../fs-input.ts';
import { CliError } from '../io.ts';
import { emptyExpectedChange, emptySpec, type ExpectedChange, type ExpectedSpec } from './spec.ts';
import {
  asBoolean, asInt, asText, field, isArray, readYamlFile, textOrNull, valueOrNull, type Node,
} from './yaml-node.ts';

export interface Fixture {
  directory: string;
  expected: ExpectedSpec;
  beforeFile: string;
  afterFile: string;
}

/** Java Comparator.comparing(Path::toString): UTF-16 order of the platform path strings. */
const byPathString = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

export function loadFixture(fixtureDir: string): Fixture {
  const expectedFile = join(fixtureDir, 'expected.yml');
  if (!isRegularFile(expectedFile)) throw new CliError('No expected.yml in ' + fixtureDir);
  const spec = parseExpected(readYamlFile(expectedFile));
  return {
    directory: fixtureDir,
    expected: spec,
    beforeFile: locate(fixtureDir, 'before', spec.seed),
    afterFile: locate(fixtureDir, 'after', spec.seed),
  };
}

/**
 * Every directory holding an expected.yml at depth 1-3 below the root, sorted by path. Accepts
 * both `fixtures/<category>/<case>/` and `fixtures/pdi-<version>/<category>/<case>/`.
 */
export function discoverFixtures(fixturesRoot: string): string[] {
  const out: string[] = [];
  if (!isDirectory(fixturesRoot)) return out;
  const collect = (dir: string, depth: number): void => {
    if (depth > 0 && isRegularFile(join(dir, 'expected.yml'))) {
      out.push(dir);
      return;
    }
    if (depth >= 3) return;
    for (const name of readdirSync(dir)) {
      const child = join(dir, name);
      if (isDirectory(child)) collect(child, depth + 1);
    }
  };
  collect(fixturesRoot, 0);
  return out.sort(byPathString);
}

/** Fixture label relative to the fixtures root, e.g. `steps/003-step-renamed`. */
export function labelFor(fixturesRoot: string, fixtureDir: string): string {
  return relative(fixturesRoot, fixtureDir).replaceAll('\\', '/');
}

// Java's default file system matches `*.ktr` globs case-insensitively on Windows only.
const KTR_GLOB = process.platform === 'win32' ? /\.ktr$/i : /\.ktr$/;

function locate(fixtureDir: string, side: string, seed: string): string {
  const nestedDir = join(fixtureDir, side);
  if (isDirectory(nestedDir)) {
    if (seed.length > 0) {
      const bySeed = join(nestedDir, seed);
      if (isRegularFile(bySeed)) return bySeed;
    }
    const ktrs = readdirSync(nestedDir).filter((name) => KTR_GLOB.test(name)).map((name) => join(nestedDir, name))
      .sort(byPathString);
    if (ktrs.length > 0) return ktrs[0]!;
  }
  const legacy = join(fixtureDir, side + '.ktr');
  if (isRegularFile(legacy)) return legacy;
  throw new CliError('No ' + side + ' KTR found in ' + fixtureDir + ' (looked for ' + side + '/'
    + (seed.length === 0 ? '*.ktr' : seed) + ' and ' + side + '.ktr)');
}

export function parseExpected(root: Node): ExpectedSpec {
  const spec = emptySpec();
  spec.schemaVersion = asInt(field(root, 'schema_version'), 1);
  const fixture = field(root, 'fixture');
  spec.id = asText(field(fixture, 'id'), '');
  spec.category = asText(field(fixture, 'category'), '');
  spec.title = asText(field(fixture, 'title'), '');
  spec.seed = asText(field(fixture, 'seed'), '');
  spec.pentahoVersion = asText(field(fixture, 'pentaho_version'), '');
  spec.manuallyEdited = asBoolean(field(fixture, 'manually_edited'), false);

  const expected = field(root, 'expected');
  spec.result = asText(field(expected, 'result'), 'changed');
  spec.strict = asBoolean(field(expected, 'strict'), true);
  spec.errorCode = textOrNull(field(expected, 'error_code'));

  // Canonical location, with a tolerated root-level fallback: the nested block wins when it
  // actually contains entries (never both merged).
  let changes = field(expected, 'changes');
  if (!isArray(changes) || changes.length === 0) {
    const rootChanges = field(root, 'changes');
    if (isArray(rootChanges) && rootChanges.length > 0) changes = rootChanges;
  }
  if (isArray(changes)) {
    for (const c of changes) spec.changes.push(parseChange(c));
  }

  let allowExtra = field(expected, 'allow_extra');
  if (!isArray(allowExtra)) allowExtra = field(root, 'allow_extra');
  if (isArray(allowExtra)) {
    for (const v of allowExtra) spec.allowExtra.push(asText(v, 'null'));
  }
  return spec;
}

function parseChange(c: Node): ExpectedChange {
  const ch = emptyExpectedChange();
  ch.kind = textOrNull(field(c, 'kind'));
  ch.classification = textOrNull(field(c, 'classification'));
  ch.entity = textOrNull(field(c, 'entity'));
  ch.stepType = textOrNull(field(c, 'step_type'));
  ch.stepName = textOrNull(field(c, 'step_name'));
  ch.beforeName = textOrNull(field(c, 'before_name'));
  ch.afterName = textOrNull(field(c, 'after_name'));
  ch.fromStep = textOrNull(field(c, 'from_step'));
  ch.toStep = textOrNull(field(c, 'to_step'));
  ch.section = textOrNull(field(c, 'section'));
  ch.field = textOrNull(field(c, 'field'));
  ch.property = textOrNull(field(c, 'property'));
  ch.before = valueOrNull(field(c, 'before'));
  ch.after = valueOrNull(field(c, 'after'));
  const added = field(c, 'added_contains');
  if (isArray(added)) for (const v of added) ch.addedContains.push(asText(v, 'null'));
  const removed = field(c, 'removed_contains');
  if (isArray(removed)) for (const v of removed) ch.removedContains.push(asText(v, 'null'));
  return ch;
}
