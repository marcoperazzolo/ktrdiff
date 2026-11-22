// it.ktrdiff.core.model.Change, ChangeKind, Classification, EntityKind — one elementary difference
// and its stable vocabulary (schema version 1). Enums are string-literal unions; the *_ORDER arrays
// keep the Java declaration order because comparators sort by enum ordinal.

export type ChangeKind =
  | 'step_added'
  | 'step_removed'
  | 'step_renamed'
  | 'step_moved'
  | 'step_property_changed'
  | 'field_added'
  | 'field_removed'
  | 'field_renamed'
  | 'field_property_changed'
  | 'hop_added'
  | 'hop_removed'
  | 'hop_changed'
  | 'filter_changed'
  | 'sql_changed'
  | 'script_changed'
  | 'note_added'
  | 'note_removed'
  | 'note_changed'
  | 'note_moved'
  | 'connection_added'
  | 'connection_removed'
  | 'connection_renamed'
  | 'connection_changed'
  | 'transformation_property_changed'
  | 'unknown_change';

export const CHANGE_KINDS: readonly ChangeKind[] = [
  'step_added',
  'step_removed',
  'step_renamed',
  'step_moved',
  'step_property_changed',
  'field_added',
  'field_removed',
  'field_renamed',
  'field_property_changed',
  'hop_added',
  'hop_removed',
  'hop_changed',
  'filter_changed',
  'sql_changed',
  'script_changed',
  'note_added',
  'note_removed',
  'note_changed',
  'note_moved',
  'connection_added',
  'connection_removed',
  'connection_renamed',
  'connection_changed',
  'transformation_property_changed',
  'unknown_change',
];

export type Classification =
  | 'functional'
  | 'layout'
  | 'metadata'
  | 'configuration'
  | 'potentially-functional'
  | 'unknown';

export const CLASSIFICATIONS: readonly Classification[] = [
  'functional',
  'layout',
  'metadata',
  'configuration',
  'potentially-functional',
  'unknown',
];

export type EntityKind = 'transformation' | 'step' | 'hop' | 'note' | 'connection' | 'xml';

export const ENTITY_KINDS: readonly EntityKind[] = [
  'transformation',
  'step',
  'hop',
  'note',
  'connection',
  'xml',
];

/** Enum ordinal, as used by Java comparators (`Enum.compareTo`). */
export function ordinal<T>(order: readonly T[], value: T): number {
  return order.indexOf(value);
}

export function changeKindFromId(id: string): ChangeKind {
  if ((CHANGE_KINDS as readonly string[]).includes(id)) return id as ChangeKind;
  throw new Error('Unknown change kind: ' + id);
}

export function classificationFromId(id: string): Classification {
  if ((CLASSIFICATIONS as readonly string[]).includes(id)) return id as Classification;
  // tolerate snake_case spelling used in configuration files
  if (id === 'potentially_functional') return 'potentially-functional';
  throw new Error('Unknown classification: ' + id);
}

export function entityKindFromId(id: string): EntityKind {
  if ((ENTITY_KINDS as readonly string[]).includes(id)) return id as EntityKind;
  throw new Error('Unknown entity kind: ' + id);
}

/** Scalar values carried by before/after, or a string list (SelectValues field_order); null where Java holds null. */
export type ChangeValue = string | number | boolean | readonly string[] | null;

/**
 * One elementary detected difference. `volatile` marks Spoon save artifacts: they stay in the
 * ChangeSet, are visible in Advanced mode, but are excluded from strict fixture counting and
 * hidden by Quick mode. Nullable fields use null (not undefined) so JSON output keeps them.
 */
export interface Change {
  readonly id: string | null;
  readonly kind: ChangeKind;
  readonly classification: Classification;
  readonly entity: EntityKind;
  readonly stepType: string | null;
  readonly stepName: string | null;
  readonly beforeName: string | null;
  readonly afterName: string | null;
  readonly fromStep: string | null;
  readonly toStep: string | null;
  readonly section: string | null;
  readonly field: string | null;
  readonly property: string | null;
  readonly before: ChangeValue;
  readonly after: ChangeValue;
  readonly addedFragments: readonly string[];
  readonly removedFragments: readonly string[];
  readonly sourceXmlPath: string | null;
  readonly confidence: number | null;
  readonly volatile: boolean;
  readonly rawDiff: string | null;
  readonly logicalId: string | null;
}

type Mutable<T> = { -readonly [K in keyof T]: T[K] };

/** Mirrors Change.Builder: fluent setters, `build()` copies the fragment lists. */
export class ChangeBuilder {
  private readonly c: Mutable<Change>;

  constructor(kind: ChangeKind, classification: Classification, entity: EntityKind) {
    this.c = {
      id: null,
      kind,
      classification,
      entity,
      stepType: null,
      stepName: null,
      beforeName: null,
      afterName: null,
      fromStep: null,
      toStep: null,
      section: null,
      field: null,
      property: null,
      before: null,
      after: null,
      addedFragments: [],
      removedFragments: [],
      sourceXmlPath: null,
      confidence: null,
      volatile: false,
      rawDiff: null,
      logicalId: null,
    };
  }

  id(v: string | null): this { this.c.id = v; return this; }
  logicalId(v: string | null): this { this.c.logicalId = v; return this; }
  stepType(v: string | null): this { this.c.stepType = v; return this; }
  stepName(v: string | null): this { this.c.stepName = v; return this; }
  beforeName(v: string | null): this { this.c.beforeName = v; return this; }
  afterName(v: string | null): this { this.c.afterName = v; return this; }
  fromStep(v: string | null): this { this.c.fromStep = v; return this; }
  toStep(v: string | null): this { this.c.toStep = v; return this; }
  section(v: string | null): this { this.c.section = v; return this; }
  field(v: string | null): this { this.c.field = v; return this; }
  property(v: string | null): this { this.c.property = v; return this; }
  before(v: ChangeValue): this { this.c.before = v; return this; }
  after(v: ChangeValue): this { this.c.after = v; return this; }
  addedFragments(v: readonly string[]): this { this.c.addedFragments = [...v]; return this; }
  removedFragments(v: readonly string[]): this { this.c.removedFragments = [...v]; return this; }
  sourceXmlPath(v: string | null): this { this.c.sourceXmlPath = v; return this; }
  confidence(v: number | null): this { this.c.confidence = v; return this; }
  volatileChange(v: boolean): this { this.c.volatile = v; return this; }
  rawDiff(v: string | null): this { this.c.rawDiff = v; return this; }

  build(): Change {
    return Object.freeze({
      ...this.c,
      addedFragments: Object.freeze([...this.c.addedFragments]),
      removedFragments: Object.freeze([...this.c.removedFragments]),
    });
  }
}

/** Change.builder(kind, classification, entity). */
/**
 * SQL and script body changes: `before`/`after` hold the whole texts (D8), the fragments hold the
 * changed lines. The text and HTML reports print the lines, as the Java engine did.
 */
export function isTextBodyChange(c: Pick<Change, 'kind' | 'property'>): boolean {
  return c.kind === 'sql_changed' || (c.kind === 'script_changed' && (c.property === 'source' || c.property === 'whitespace'));
}

export function change(kind: ChangeKind, classification: Classification, entity: EntityKind): ChangeBuilder {
  return new ChangeBuilder(kind, classification, entity);
}

/** Builder pre-filled with every field of an existing change (Java rebuilds ids this way). */
export function changeFrom(source: Change): ChangeBuilder {
  const b = new ChangeBuilder(source.kind, source.classification, source.entity);
  return b.id(source.id).logicalId(source.logicalId).stepType(source.stepType)
    .stepName(source.stepName).beforeName(source.beforeName).afterName(source.afterName)
    .fromStep(source.fromStep).toStep(source.toStep).section(source.section)
    .field(source.field).property(source.property).before(source.before).after(source.after)
    .addedFragments(source.addedFragments).removedFragments(source.removedFragments)
    .sourceXmlPath(source.sourceXmlPath).confidence(source.confidence)
    .volatileChange(source.volatile).rawDiff(source.rawDiff);
}
