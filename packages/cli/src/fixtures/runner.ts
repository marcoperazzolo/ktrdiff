// it.ktrdiff.core.fixtures.FixtureRunner: runs every fixture in Advanced mode against its
// expected.yml, applying the quarantine of fixtures-known-issues.yml.

import { advancedConfig, compareDocuments, type ChangeSet } from '@ktrdiff/core';
import { readDocument, isRegularFile } from '../fs-input.ts';
import { CliError, isFsError } from '../io.ts';
import { discoverFixtures, labelFor, loadFixture, type Fixture } from './loader.ts';
import { verify } from './matcher.ts';
import { asText, field, isArray, readYamlFile } from './yaml-node.ts';

export type FixtureStatus = 'PASS' | 'FAIL' | 'KNOWN_ISSUE' | 'KNOWN_ISSUE_PASSING' | 'LOAD_ERROR';

export interface FixtureResult {
  label: string;
  id: string;
  status: FixtureStatus;
  problems: string[];
  knownIssueReason: string | null;
}

export const countsAsFailure = (r: FixtureResult): boolean => r.status === 'FAIL' || r.status === 'LOAD_ERROR';

const message = (e: unknown): string => (e instanceof Error ? e.message : String(e));

/** All fixtures under the root; `idFilter` restricts by fixture id or label. */
export function runFixtures(fixturesRoot: string, knownIssuesFile: string | null, idFilter: string | null): FixtureResult[] {
  const knownIssues = loadKnownIssues(knownIssuesFile);
  const results: FixtureResult[] = [];
  for (const dir of discoverFixtures(fixturesRoot)) {
    const result = runOne(fixturesRoot, dir, knownIssues);
    if (idFilter !== null && idFilter.length > 0 && !matchesFilter(idFilter, result.id, result.label)) continue;
    results.push(result);
  }
  return results;
}

export function runOne(fixturesRoot: string, fixtureDir: string, knownIssues: ReadonlyMap<string, string>): FixtureResult {
  const label = labelFor(fixturesRoot, fixtureDir);
  let fixture: Fixture;
  try {
    fixture = loadFixture(fixtureDir);
  } catch (e) {
    if (!(e instanceof CliError) && !isFsError(e)) throw e;
    return { label, id: '?', status: 'LOAD_ERROR', problems: ['cannot load fixture: ' + message(e)], knownIssueReason: null };
  }
  // The declared pentaho_version travels with the inputs; the engine tolerates a missing or
  // unknown version and falls back to common parsing.
  const version = fixture.expected.pentahoVersion;
  let changeSet: ChangeSet;
  try {
    changeSet = compareDocuments(readDocument(fixture.beforeFile, version), readDocument(fixture.afterFile, version),
      advancedConfig());
  } catch (e) {
    if (!isFsError(e)) throw e;
    return {
      label, id: fixture.expected.id, status: 'LOAD_ERROR', problems: ['cannot read fixture files: ' + message(e)],
      knownIssueReason: null,
    };
  }
  const verdict = verify(fixture.expected, changeSet);
  const issueReason = knownIssueFor(knownIssues, fixture.expected.id, label);
  if (issueReason !== null) {
    return {
      label, id: fixture.expected.id, status: verdict.passed ? 'KNOWN_ISSUE_PASSING' : 'KNOWN_ISSUE',
      problems: verdict.problems, knownIssueReason: issueReason,
    };
  }
  return {
    label, id: fixture.expected.id, status: verdict.passed ? 'PASS' : 'FAIL', problems: verdict.problems,
    knownIssueReason: null,
  };
}

function matchesFilter(filter: string, id: string, label: string): boolean {
  const f = filter.toLowerCase();
  const normalizedLabel = label.toLowerCase().replaceAll('\\', '/');
  return f === id.toLowerCase() || normalizedLabel === f || normalizedLabel.includes(f);
}

function knownIssueFor(knownIssues: ReadonlyMap<string, string>, id: string, label: string): string | null {
  const normalizedLabel = label.replaceAll('\\', '/');
  for (const [key, reason] of knownIssues) {
    if (key === id || key === normalizedLabel) return reason;
  }
  return null;
}

/** fixture (id or category/case path) -> reason, in file order. */
export function loadKnownIssues(file: string | null): Map<string, string> {
  const map = new Map<string, string>();
  if (file === null || !isRegularFile(file)) return map;
  const issues = field(readYamlFile(file), 'known_issues');
  if (isArray(issues)) {
    for (const issue of issues) {
      const fixture = asText(field(issue, 'fixture'), '');
      const reason = asText(field(issue, 'reason'), '');
      if (fixture.length > 0) map.set(fixture, reason);
    }
  }
  return map;
}
