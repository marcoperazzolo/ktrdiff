// Public API of @ktrdiff/core. Filled in step by step while porting the v0.2.0 Java engine.

import type { DocumentInput } from './engine/diff-engine.ts';
import { DirectoryDiffEngine, type DirectoryResult } from './engine/directory-engine.ts';
import { defaultConfig, type DiffConfig } from './profile/diff-config.ts';
import type { TransformationModel } from './model/document.ts';
import { parseDocumentRoot } from './parser/document-parser.ts';
import { parseTransformationRoot } from './parser/ktr-parser.ts';
import { parseXmlBytes, parseXmlString } from './xml/secure-xml.ts';
import type { XmlNode } from './xml/xml-node.ts';

export const CORE_VERSION = '0.3.1-dev';


/** The part of DiffConfig the parsers read (DiffConfig itself arrives in step F1). */
export interface ParseLimits {
  maxFileBytes?: number;
}

function parseXml(input: DocumentInput, config: ParseLimits): XmlNode {
  const limits = config.maxFileBytes === undefined ? {} : { maxBytes: config.maxFileBytes };
  return typeof input.content === 'string'
    ? parseXmlString(input.content, limits)
    : parseXmlBytes(input.content, limits);
}

/** Parses a KTR, KJB or KDB document into the shared model. Throws ParseError {code}. */
export function parseDocument(input: DocumentInput, config: ParseLimits = {}): TransformationModel {
  return parseDocumentRoot(parseXml(input, config));
}

/** Transformation-only parsing (KtrParser), used by the inspect and validate commands. */
export function parseTransformation(input: DocumentInput, config: ParseLimits = {}): TransformationModel {
  return parseTransformationRoot(parseXml(input, config));
}

export {
  ConnectionModel, HopModel, NoteModel, StepModel, TransformationModel,
} from './model/document.ts';
export type { DocumentType } from './model/document.ts';
export {
  advancedConfig, defaultConfig, includes, modeFromId, withInclude, MODES,
} from './profile/diff-config.ts';
export type { DiffConfig, FailOn, Mode } from './profile/diff-config.ts';
export { mergeConfig } from './profile/merge-config.ts';
export { AdapterRegistry } from './engine/adapter-registry.ts';
export { compareDocuments, DiffEngine } from './engine/diff-engine.ts';
export type { DocumentInput } from './engine/diff-engine.ts';
export { renderJson } from './render/json.ts';
export { changeSetResult } from './model/change-set.ts';
export type { ChangeSet, MatchingDecision } from './model/change-set.ts';
export type { Change, ChangeKind, Classification, EntityKind } from './model/change.ts';
export { ComparisonContext } from './engine/step-adapter.ts';
export type { StepAdapter } from './engine/step-adapter.ts';
export { applyMode, hiddenCounts } from './profile/mode-filter.ts';
export type { FilteredChangeSet } from './profile/mode-filter.ts';
export type { DiffError, DiffWarning, ErrorCode } from './model/errors.ts';
export { diffErrorToString } from './model/errors.ts';
export { sameStepType } from './match/step-type-aliases.ts';
export { ParseError } from './xml/parse-error.ts';
export { XmlNode } from './xml/xml-node.ts';
export { renderText } from './render/text.ts';
export { renderHtml } from './render/html.ts';
export {
  DirectoryInputError, isSupportedPath, MAX_FILES, normalizePath,
} from './engine/directory-engine.ts';
export { DirectoryDiffEngine };
export type { DirectoryResult, FileDiff, FileMethod, FileStatus } from './engine/directory-engine.ts';
export { renderDirectoryJson } from './render/directory-json.ts';
export { summarizeChanges } from './engine/summary.ts';
export { isTextBodyChange } from './model/change.ts';
export { alignLines, wordDiff } from './adapters/word-diff.ts';
export type { AlignedRow, RowKind, WordOp, WordPart } from './adapters/word-diff.ts';
export type { ChangeSummary, CountByAction } from './engine/summary.ts';

const DEFAULT_DIRECTORY_ENGINE = new DirectoryDiffEngine();

/** Compares two folders given as flat lists; each input's `name` is its relative path. */
export function compareDirectories(before: readonly DocumentInput[], after: readonly DocumentInput[],
  config?: DiffConfig): DirectoryResult {
  return DEFAULT_DIRECTORY_ENGINE.compare(before, after, config ?? defaultConfig());
}
