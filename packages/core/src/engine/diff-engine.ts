// it.ktrdiff.core.engine.DiffEngine, KtrDiffEngine, KtrInput — full comparison pipeline: match
// steps, detect every change through adapters, compare hops on logical identities, notes,
// connections and document properties, classify, and return a complete deterministic ChangeSet.
// Presentation modes filter later, never here. Stateless: every call parses fresh models.

import { CHANGE_KINDS, ENTITY_KINDS, changeFrom, ordinal, type Change } from '../model/change.ts';
import { changeSet, type ChangeSet, type MatchingDecision } from '../model/change-set.ts';
import type { TransformationModel } from '../model/document.ts';
import { diffError, type DiffError, type DiffWarning, type Side } from '../model/errors.ts';
import { PentahoVersion } from '../model/pentaho-version.ts';
import { matchSteps } from '../match/step-matcher.ts';
import { parseDocumentRoot } from '../parser/document-parser.ts';
import { defaultConfig, type DiffConfig } from '../profile/diff-config.ts';
import { compareUtf16 } from '../util/java.ts';
import { decodeUtf8, utf8ByteLength } from '../util/utf8.ts';
import { ParseError } from '../xml/parse-error.ts';
import { parseXmlString } from '../xml/secure-xml.ts';
import { AdapterRegistry } from './adapter-registry.ts';
import { compareConnections } from './compare-connections.ts';
import { compareHops } from './compare-hops.ts';
import { compareInfo } from './compare-info.ts';
import { compareNotes } from './compare-notes.ts';
import { compareRootExtras } from './compare-root.ts';
import { compareSteps } from './compare-steps.ts';
import { buildGraph } from './graph-view.ts';
import { javaValueOf } from './values.ts';

/** Transport-independent comparison input (KtrInput); `name` is for display and folder pairing. */
export interface DocumentInput {
  name: string;
  content: Uint8Array | string;
  pentahoVersion?: string;
}

export function inputSize(input: DocumentInput): number {
  return typeof input.content === 'string' ? utf8ByteLength(input.content) : input.content.length;
}

/** KtrInput.contentAsString: UTF-8 decoding with a leading BOM kept, invalid bytes -> U+FFFD. */
export function inputText(input: DocumentInput): string {
  return typeof input.content === 'string' ? input.content : decodeUtf8(input.content);
}

function errorChangeSet(errors: readonly DiffError[]): ChangeSet {
  return changeSet([], [], errors, [], new Map());
}

export class DiffEngine {
  readonly registry = new AdapterRegistry();

  /** DiffEngine.compare(KtrInput, KtrInput, DiffConfig): size limits, parsing, comparison. */
  compareInputs(before: DocumentInput, after: DocumentInput, options: DiffConfig | null = null): ChangeSet {
    const config = options ?? defaultConfig();
    const beforeSize = inputSize(before);
    const afterSize = inputSize(after);
    if (beforeSize > config.maxFileBytes || afterSize > config.maxFileBytes) {
      const errors: DiffError[] = [];
      if (beforeSize > config.maxFileBytes) {
        errors.push(diffError('file_too_large', 'Input exceeds the size limit (' + beforeSize + ' bytes)', 'before'));
      }
      if (afterSize > config.maxFileBytes) {
        errors.push(diffError('file_too_large', 'Input exceeds the size limit (' + afterSize + ' bytes)', 'after'));
      }
      return errorChangeSet(errors);
    }
    const version = PentahoVersion.parse(after.pentahoVersion) ?? PentahoVersion.parse(before.pentahoVersion);
    const errors: DiffError[] = [];
    const b = parseSide(inputText(before), config, 'before', errors);
    const a = parseSide(inputText(after), config, 'after', errors);
    if (errors.length > 0 || b === null || a === null) return errorChangeSet(errors);
    return this.compareModels(b, a, config, version);
  }

  /** DiffEngine.compare(TransformationModel, TransformationModel, DiffConfig, PentahoVersion). */
  compareModels(before: TransformationModel, after: TransformationModel, config: DiffConfig,
    version: PentahoVersion | null = null): ChangeSet {
    if (before.documentType() !== after.documentType()) {
      return errorChangeSet([diffError('unsupported_document', 'Cannot compare different Pentaho document types', null)]);
    }
    const changes: Change[] = [];
    const warnings: DiffWarning[] = [];
    const decisions: MatchingDecision[] = [];

    const match = matchSteps(before, after, config.renameThreshold);
    warnings.push(...match.warnings);
    decisions.push(...match.decisions);

    compareSteps(this.registry, match, config, version, changes);
    compareHops(before, after, changes);
    compareNotes(before, after, changes);
    compareConnections(before, after, changes);
    compareInfo(before, after, changes);
    compareRootExtras(before, after, changes);

    changes.sort(changeOrder);
    const withIds: Change[] = [];
    let seq = 0;
    for (const c of changes) {
      withIds.push(changeFrom(c).id('c' + (++seq)).logicalId(changeLogicalId(c, before, after)).build());
    }

    const metadata = new Map<string, string>();
    metadata.set('beforeTransformation', before.name);
    metadata.set('afterTransformation', after.name);
    metadata.set('beforeSteps', String(before.steps.length));
    metadata.set('afterSteps', String(after.steps.length));
    metadata.set('documentType', after.documentType());
    if (version !== null && version.raw !== null) metadata.set('pentahoVersion', version.raw);

    const graph = buildGraph(this.registry, before, after, match, withIds);
    return changeSet(withIds, warnings, [], decisions, metadata, graph);
  }
}

function parseSide(content: string, config: DiffConfig, side: Side, errors: DiffError[]): TransformationModel | null {
  try {
    return parseDocumentRoot(parseXmlString(content, { maxBytes: config.maxFileBytes }));
  } catch (e) {
    if (e instanceof ParseError) {
      errors.push(diffError(e.code, e.message, side));
      return null;
    }
    throw e;
  }
}

/** Deterministic output order (entity -> step -> section -> field -> property -> kind -> …). */
export function changeOrder(x: Change, y: Change): number {
  return (ordinal(ENTITY_KINDS, x.entity) - ordinal(ENTITY_KINDS, y.entity))
    || compareUtf16(x.stepName ?? '', y.stepName ?? '')
    || compareUtf16(x.beforeName ?? '', y.beforeName ?? '')
    || compareUtf16(x.section ?? '', y.section ?? '')
    || compareUtf16(x.field ?? '', y.field ?? '')
    || compareUtf16(x.property ?? '', y.property ?? '')
    || (ordinal(CHANGE_KINDS, x.kind) - ordinal(CHANGE_KINDS, y.kind))
    || compareUtf16(x.fromStep ?? '', y.fromStep ?? '')
    || compareUtf16(x.toStep ?? '', y.toStep ?? '')
    || compareUtf16(javaValueOf(x.before), javaValueOf(y.before))
    || compareUtf16(javaValueOf(x.after), javaValueOf(y.after));
}

function changeLogicalId(c: Change, before: TransformationModel, after: TransformationModel): string | null {
  const name = c.kind === 'step_renamed' ? c.afterName : c.stepName;
  if (name === null) return null;
  const step = (c.kind === 'step_removed' ? before : after).stepByName(name);
  return step === null ? null : step.logicalId;
}

const DEFAULT_ENGINE = new DiffEngine();

/** Public entry point: compares two KTR/KJB/KDB documents; parse failures become ChangeSet errors. */
export function compareDocuments(before: DocumentInput, after: DocumentInput, config?: DiffConfig): ChangeSet {
  return DEFAULT_ENGINE.compareInputs(before, after, config ?? null);
}
