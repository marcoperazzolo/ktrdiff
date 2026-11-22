#!/usr/bin/env node
// Guards the "runs unchanged in a browser Worker and in Node" promise of packages/core.
// Type-checking (core tsconfig has no DOM/Node types) is the first line of defence; this script
// adds two checks that do not depend on tsconfig settings staying intact:
//   1. esbuild can bundle the public entry point for a neutral platform with no externals,
//      so any `node:` import or unresolvable module fails here;
//   2. an AST scan of packages/core/src rejects platform globals and Node module specifiers.
// The scan walks the TypeScript AST instead of grepping, so comments, strings and identifiers
// such as `parseDocument` do not produce false positives.

import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import ts from 'typescript';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const coreSrc = join(repoRoot, 'packages', 'core', 'src');
const entry = join(coreSrc, 'index.ts');

// Globals that only exist in Node or in the DOM, or that would make core impure/asynchronous.
const BANNED_IDENTIFIERS = new Set([
  'require',
  'process',
  'Buffer',
  'window',
  'document',
  'globalThis',
  'crypto',
  'setTimeout',
  'setInterval',
  'setImmediate',
  'fetch',
]);

function listTsFiles(dir) {
  const out = [];
  for (const entryDirent of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entryDirent.name);
    if (entryDirent.isDirectory()) out.push(...listTsFiles(full));
    else if (entryDirent.name.endsWith('.ts')) out.push(full);
  }
  return out.sort();
}

// A banned name is fine when it is only a member name (`x.process`, `{ document: … }`,
// `process() {}` in a class): it does not reference the global.
function isMemberName(node) {
  const parent = node.parent;
  if (!parent) return false;
  if (ts.isPropertyAccessExpression(parent) && parent.name === node) return true;
  if (ts.isQualifiedName(parent) && parent.right === node) return true;
  if (
    (ts.isPropertyAssignment(parent) ||
      ts.isPropertyDeclaration(parent) ||
      ts.isPropertySignature(parent) ||
      ts.isMethodDeclaration(parent) ||
      ts.isMethodSignature(parent) ||
      ts.isGetAccessorDeclaration(parent) ||
      ts.isSetAccessorDeclaration(parent) ||
      ts.isEnumMember(parent)) &&
    parent.name === node
  ) {
    return true;
  }
  return false;
}

function moduleSpecifierOf(node) {
  if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier) {
    return node.moduleSpecifier;
  }
  if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)) {
    return node.moduleReference.expression;
  }
  if (
    ts.isCallExpression(node) &&
    node.expression.kind === ts.SyntaxKind.ImportKeyword &&
    node.arguments.length > 0
  ) {
    return node.arguments[0];
  }
  if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)) {
    return node.argument.literal;
  }
  return undefined;
}

function scanFile(file) {
  const text = readFileSync(file, 'utf8');
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS);
  const problems = [];
  const report = (node, message) => {
    const { line, character } = source.getLineAndCharacterOfPosition(node.getStart(source));
    problems.push(`${relative(repoRoot, file).replaceAll('\\', '/')}:${line + 1}:${character + 1} ${message}`);
  };
  const visit = (node) => {
    const specifier = moduleSpecifierOf(node);
    if (specifier && ts.isStringLiteralLike(specifier)) {
      // Core may only import its own relative modules: no Node built-ins, no packages.
      if (!specifier.text.startsWith('.')) {
        report(specifier, `non-relative import '${specifier.text}'`);
      }
    }
    if (ts.isIdentifier(node) && BANNED_IDENTIFIERS.has(node.text) && !isMemberName(node)) {
      report(node, `banned identifier '${node.text}'`);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return problems;
}

async function checkBundle() {
  try {
    await build({
      entryPoints: [entry],
      bundle: true,
      platform: 'neutral',
      format: 'esm',
      write: false,
      logLevel: 'silent',
    });
    return [];
  } catch (error) {
    const messages = (error.errors ?? []).map((e) => {
      const where = e.location ? `${e.location.file}:${e.location.line}:${e.location.column + 1} ` : '';
      return `esbuild: ${where}${e.text}`;
    });
    return messages.length > 0 ? messages : [`esbuild: ${error.message}`];
  }
}

const problems = [...(await checkBundle())];
const files = listTsFiles(coreSrc);
for (const file of files) problems.push(...scanFile(file));

if (problems.length > 0) {
  console.error(`check-core-purity: ${problems.length} problem(s) in packages/core/src`);
  for (const problem of problems) console.error(`  ${problem}`);
  process.exit(1);
}
console.log(`check-core-purity: OK (${files.length} files scanned, neutral bundle built)`);
