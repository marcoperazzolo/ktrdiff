// it.ktrdiff.core.engine.DirectoryDiffEngine — transport-independent, in-memory directory
// comparison. Paths are labels, never opened here. Matching: relative path, unique basename,
// unique semantic content. Ambiguous renames stay additions/removals with a warning.

import { changeSet, hasErrors, type ChangeSet } from '../model/change-set.ts';
import { TransformationModel } from '../model/document.ts';
import { diffError, diffWarning, type DiffWarning } from '../model/errors.ts';
import { PentahoVersion } from '../model/pentaho-version.ts';
import { canonical } from '../normalize/normalizer.ts';
import { semanticSignature } from '../normalize/semantic-step.ts';
import { isVolatileInfoProperty } from '../normalize/volatile.ts';
import { parseDocumentRoot } from '../parser/document-parser.ts';
import type { DiffConfig } from '../profile/diff-config.ts';
import { applyMode } from '../profile/mode-filter.ts';
import { compareUtf16 } from '../util/java.ts';
import { sha256Base64 } from '../util/sha256.ts';
import { ParseError } from '../xml/parse-error.ts';
import { parseXmlString } from '../xml/secure-xml.ts';
import { XmlNode } from '../xml/xml-node.ts';
import { DiffEngine, inputSize, inputText, type DocumentInput } from './diff-engine.ts';
import { summarizeChanges, type ChangeSummary } from './summary.ts';

export const MAX_FILES = 1000;

export type FileStatus = 'added' | 'removed' | 'renamed' | 'modified' | 'unchanged' | 'error';
export type FileMethod = 'path' | 'basename' | 'semantic' | 'unmatched';

export interface FileDiff {
  readonly beforePath: string | null;
  readonly afterPath: string | null;
  readonly status: FileStatus;
  readonly method: FileMethod;
  readonly changeSet: ChangeSet;
  /** Entities touched by the changes visible in the requested mode (D2). */
  readonly summary: ChangeSummary;
}

/** A paired or unmatched file before its summary is computed. */
type PendingFile = Omit<FileDiff, 'summary'>;

export interface DirectoryResult {
  readonly files: readonly FileDiff[];
  readonly warnings: readonly DiffWarning[];
}

/** Rejected directory input (Java IllegalArgumentException): the whole comparison is refused. */
export class DirectoryInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DirectoryInputError';
  }
}

function fileDiff(beforePath: string | null, afterPath: string | null, status: FileStatus,
  method: FileMethod, cs: ChangeSet): PendingFile {
  return { beforePath, afterPath, status: hasErrors(cs) ? 'error' : status, method, changeSet: cs };
}

const SUPPORTED = /^[^\n\r\u0085\u2028\u2029]*\.(ktr|kjb|kdb)$/;

/** Java `.*\.(ktr|kjb|kdb)$` with matches(): `.` excludes the Java line terminators. */
export function isSupportedPath(path: string): boolean {
  return SUPPORTED.test(path.toLowerCase());
}

export function normalizePath(path: string): string {
  const value = path.replaceAll('\\', '/');
  if (value.length === 0 || value.startsWith('/') || value.includes(':') || value.includes('\0')
    || value.split('/').some((p) => p.length === 0 || p === '..' || p === '.')) {
    throw new DirectoryInputError('Only safe relative file paths are accepted');
  }
  return value;
}

function basename(path: string): string {
  return path.substring(path.lastIndexOf('/') + 1);
}

function parseModel(input: DocumentInput, config: DiffConfig): TransformationModel {
  return parseDocumentRoot(parseXmlString(inputText(input), { maxBytes: config.maxFileBytes }));
}

/** TreeMap view of one side: normalized path -> input, keys in UTF-16 order. */
type Side = Map<string, DocumentInput>;

export class DirectoryDiffEngine {
  private readonly engine: DiffEngine;

  constructor(engine: DiffEngine = new DiffEngine()) {
    this.engine = engine;
  }

  /** `name` of every input is its relative path; unsupported extensions are ignored. */
  compare(before: readonly DocumentInput[], after: readonly DocumentInput[], config: DiffConfig): DirectoryResult {
    const b = validate(before, config);
    const a = validate(after, config);
    const files: PendingFile[] = [];
    const warnings: DiffWarning[] = [];
    for (const path of [...b.keys()]) if (a.has(path)) this.pair(path, path, 'path', b, a, config, files);
    // A unique same-named file moved to another directory is paired even if edited.
    this.pairUnique(b, a, basename, 'basename', config, files);
    const signatures = new Map<string, string | null>();
    for (const [path, input] of b) signatures.set('b:' + path, signature(input, config));
    for (const [path, input] of a) signatures.set('a:' + path, signature(input, config));
    const bg = groups(b, (path) => signatures.get('b:' + path) ?? null);
    const ag = groups(a, (path) => signatures.get('a:' + path) ?? null);
    for (const [key, bPaths] of bg) {
      const aPaths = ag.get(key);
      if (aPaths === undefined) continue;
      if (bPaths.length === 1 && aPaths.length === 1) this.pair(bPaths[0]!, aPaths[0]!, 'semantic', b, a, config, files);
      else warnings.push(diffWarning('ambiguous_file_rename', 'Identical content has multiple possible file renames; kept as additions/removals.'));
    }
    for (const [path, input] of b) files.push(fileDiff(path, null, 'removed', 'unmatched', this.presence(input, false, config)));
    for (const [path, input] of a) files.push(fileDiff(null, path, 'added', 'unmatched', this.presence(input, true, config)));
    files.sort((x, y) => compareUtf16(x.afterPath ?? x.beforePath ?? '', y.afterPath ?? y.beforePath ?? ''));
    const summarized = files.map((f): FileDiff => ({ ...f, summary: summarizeChanges(applyMode(f.changeSet, config).visible) }));
    return { files: summarized, warnings };
  }

  /** A whole-file addition/removal, compared against an empty document of the same dialect. */
  presence(input: DocumentInput, added: boolean, config: DiffConfig): ChangeSet {
    let model: TransformationModel;
    try {
      model = parseModel(input, config);
    } catch (e) {
      if (e instanceof ParseError) {
        return changeSet([], [], [diffError(e.code, e.message, added ? 'after' : 'before')], [], new Map());
      }
      throw e;
    }
    const infoPath = model.info !== null ? model.info.path : model.root.path + '/info';
    const info = new XmlNode('info', '', new Map(), [], infoPath);
    const root = new XmlNode('transformation', '', new Map(), [info], model.root.path);
    const empty = new TransformationModel('', '', info, [], [], [], [], root);
    const version = PentahoVersion.parse(input.pentahoVersion);
    return this.engine.compareModels(added ? empty : model, added ? model : empty, config, version);
  }

  private pairUnique(b: Side, a: Side, key: (path: string) => string, method: FileMethod,
    config: DiffConfig, files: PendingFile[]): void {
    const bg = groups(b, key);
    const ag = groups(a, key);
    for (const [k, bPaths] of bg) {
      const aPaths = ag.get(k);
      if (aPaths !== undefined && bPaths.length === 1 && aPaths.length === 1) {
        this.pair(bPaths[0]!, aPaths[0]!, method, b, a, config, files);
      }
    }
  }

  private pair(bp: string, ap: string, method: FileMethod, b: Side, a: Side, config: DiffConfig,
    files: PendingFile[]): void {
    const beforeInput = b.get(bp)!;
    const afterInput = a.get(ap)!;
    b.delete(bp);
    a.delete(ap);
    const cs = this.engine.compareInputs(beforeInput, afterInput, config);
    const status: FileStatus = hasErrors(cs) ? 'error' : bp !== ap ? 'renamed'
      : cs.changes.length === 0 ? 'unchanged' : 'modified';
    files.push(fileDiff(bp, ap, status, method, cs));
  }
}

function groups(inputs: Side, key: (path: string) => string | null): Map<string, string[]> {
  const result = new Map<string, string[]>();
  for (const path of inputs.keys()) {
    const k = key(path);
    if (k === null) continue;
    const list = result.get(k);
    if (list === undefined) result.set(k, [path]);
    else list.push(path);
  }
  return result;
}

function validate(inputs: readonly DocumentInput[], config: DiffConfig): Side {
  if (inputs.length > MAX_FILES) throw new DirectoryInputError('At most ' + MAX_FILES + ' files per directory');
  const result = new Map<string, DocumentInput>();
  let total = 0;
  for (const input of inputs) {
    const path = normalizePath(input.name);
    if (!isSupportedPath(path)) continue;
    if (result.has(path)) throw new DirectoryInputError('Duplicate relative path');
    result.set(path, input);
    total += inputSize(input);
    if (total > config.maxFileBytes) throw new DirectoryInputError('Directory exceeds the aggregate upload limit');
  }
  const sorted = new Map<string, DocumentInput>();
  for (const path of [...result.keys()].sort(compareUtf16)) sorted.set(path, result.get(path)!);
  return sorted;
}

const HOP_ENDPOINTS: ReadonlySet<string> = new Set(['from', 'to', 'from_nr', 'to_nr']);
const NOTE_LAYOUT: ReadonlySet<string> = new Set(['xloc', 'yloc', 'width', 'height', 'heigth']);
const ROOT_SECTIONS: ReadonlySet<string> = new Set(['info', 'step', 'connection', 'order', 'notepads']);
const CONNECTION_NAME: ReadonlySet<string> = new Set(['name']);
const NOTHING: ReadonlySet<string> = new Set();

/**
 * Content signature for semantic file renames: step identities are content hashes, so a renamed
 * step inside a renamed file still pairs. Private to one call, never serialized or logged.
 */
function signature(input: DocumentInput, config: DiffConfig): string | null {
  let model: TransformationModel;
  try {
    model = parseModel(input, config);
  } catch (e) {
    if (e instanceof ParseError) return null;
    throw e;
  }
  const parts: string[] = [model.documentType()];
  const placeholders = new Map<string, string>();
  for (const s of model.steps) placeholders.set(s.name, '@reference');
  const identities = new Map<string, string>();
  for (const s of model.steps) identities.set(s.name, sha256Base64(semanticSignature(s, placeholders)));
  for (const s of model.steps) parts.push('step:' + semanticSignature(s, identities));
  for (const h of model.hops) {
    parts.push('hop:' + (identities.get(h.from) ?? h.from) + '->' + (identities.get(h.to) ?? h.to) + ':' + h.enabled);
  }
  if (model.info !== null) {
    for (const child of model.info.children) {
      if (!isVolatileInfoProperty(child.name)) parts.push('info:' + canonical(child, null));
    }
  }
  for (const connection of model.connections) {
    if (connection.xml === null) continue;
    parts.push('connection:' + canonical(connection.xml,
      model.documentType() === 'connection' ? CONNECTION_NAME : NOTHING));
  }
  const order = model.root.child('order');
  if (order !== null) {
    for (const hop of order.childrenNamed('hop')) parts.push('hop-properties:' + canonical(hop, HOP_ENDPOINTS));
  }
  for (const n of model.notes) {
    if (n.xml !== null) parts.push('note:' + canonical(n.xml, NOTE_LAYOUT));
  }
  parts.push('extensions:' + canonical(model.root, ROOT_SECTIONS));
  parts.sort(compareUtf16);
  return sha256Base64(parts.join('\n'));
}
