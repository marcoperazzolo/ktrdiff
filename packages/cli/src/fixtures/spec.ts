// it.ktrdiff.core.fixtures.ExpectedSpec: parsed view of one expected.yml (schema version 1).
// Never modified by the tooling.

/** One declared change; only non-null fields participate in matching. */
export interface ExpectedChange {
  kind: string | null;
  classification: string | null;
  entity: string | null;
  stepType: string | null;
  stepName: string | null;
  beforeName: string | null;
  afterName: string | null;
  fromStep: string | null;
  toStep: string | null;
  section: string | null;
  field: string | null;
  property: string | null;
  /** YAML scalar: boolean, number or text; null when absent. */
  before: string | number | boolean | null;
  after: string | number | boolean | null;
  addedContains: string[];
  removedContains: string[];
}

export interface ExpectedSpec {
  schemaVersion: number;
  id: string;
  category: string;
  title: string;
  seed: string;
  pentahoVersion: string;
  manuallyEdited: boolean;
  /** unchanged | changed | error */
  result: string;
  strict: boolean;
  /** null unless result == error */
  errorCode: string | null;
  changes: ExpectedChange[];
  allowExtra: string[];
}

export function emptySpec(): ExpectedSpec {
  return {
    schemaVersion: 1, id: '', category: '', title: '', seed: '', pentahoVersion: '',
    manuallyEdited: false, result: 'changed', strict: true, errorCode: null, changes: [], allowExtra: [],
  };
}

export function emptyExpectedChange(): ExpectedChange {
  return {
    kind: null, classification: null, entity: null, stepType: null, stepName: null, beforeName: null,
    afterName: null, fromStep: null, toStep: null, section: null, field: null, property: null,
    before: null, after: null, addedContains: [], removedContains: [],
  };
}

/** Java String.valueOf of a YAML scalar (Long/Double/Boolean/String). */
export function scalarToString(v: unknown): string {
  return v === null || v === undefined ? 'null' : String(v);
}

/** ExpectedChange.toString, used in failure messages. */
export function expectedChangeToString(e: ExpectedChange): string {
  let sb = e.kind ?? '?';
  if (e.stepName !== null) sb += ' step=' + e.stepName;
  if (e.beforeName !== null || e.afterName !== null) {
    sb += ' ' + scalarToString(e.beforeName) + ' -> ' + scalarToString(e.afterName);
  }
  if (e.fromStep !== null || e.toStep !== null) {
    sb += ' hop ' + scalarToString(e.fromStep) + ' -> ' + scalarToString(e.toStep);
  }
  if (e.field !== null) sb += ' field=' + e.field;
  if (e.property !== null) sb += ' property=' + e.property;
  if (e.before !== null || e.after !== null) {
    sb += ' (' + scalarToString(e.before) + ' -> ' + scalarToString(e.after) + ')';
  }
  return sb;
}
