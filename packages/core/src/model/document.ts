// it.ktrdiff.core.model.TransformationModel, StepModel, HopModel, NoteModel, ConnectionModel —
// parsed view of one .ktr document (KJB/KDB are projected into the same shape).

import { javaTrim } from '../util/java.ts';
import type { XmlNode } from '../xml/xml-node.ts';

/** Java regex `\s+` (ASCII whitespace only, unlike JS `\s`). */
const JAVA_WHITESPACE_RUN = /[ \t\n\x0B\f\r]+/g;

function positionString(x: number | null, y: number | null): string {
  return (x === null ? '?' : String(x)) + ',' + (y === null ? '?' : String(y));
}

/**
 * One transformation step. `name` is trimmed for identity (KTR files in the wild carry trailing
 * newlines inside <name>); `originalName` keeps the raw value for rendering. `logicalId` is
 * assigned by the matcher so hops can be compared across renames.
 */
export class StepModel {
  readonly name: string;
  readonly originalName: string;
  readonly type: string;
  readonly xml: XmlNode | null;
  readonly xloc: number | null;
  readonly yloc: number | null;
  private _logicalId: string | null = null;

  constructor(originalName: string | null, type: string | null, xml: XmlNode | null,
    xloc: number | null, yloc: number | null) {
    this.originalName = originalName ?? '';
    this.name = javaTrim(this.originalName);
    this.type = type === null ? '' : javaTrim(type);
    this.xml = xml;
    this.xloc = xloc;
    this.yloc = yloc;
  }

  get logicalId(): string | null {
    return this._logicalId;
  }

  assignLogicalId(id: string | null): void {
    this._logicalId = id;
  }

  positionString(): string {
    return positionString(this.xloc, this.yloc);
  }

  toString(): string {
    return this.name + ' [' + this.type + ']';
  }
}

/** A hop between two steps; references are trimmed step names as written in <order>. */
export class HopModel {
  readonly from: string;
  readonly to: string;
  readonly enabled: boolean;

  constructor(from: string | null, to: string | null, enabled: boolean) {
    this.from = from === null ? '' : javaTrim(from);
    this.to = to === null ? '' : javaTrim(to);
    this.enabled = enabled;
  }

  toString(): string {
    return this.from + ' -> ' + this.to + (this.enabled ? '' : ' (disabled)');
  }
}

/** A canvas note. Text and position are compared separately. */
export class NoteModel {
  readonly text: string;
  readonly xloc: number | null;
  readonly yloc: number | null;
  readonly width: number | null;
  readonly height: number | null;
  readonly xml: XmlNode | null;

  constructor(text: string | null, xloc: number | null, yloc: number | null,
    width: number | null, height: number | null, xml: XmlNode | null) {
    this.text = text ?? '';
    this.xloc = xloc;
    this.yloc = yloc;
    this.width = width;
    this.height = height;
    this.xml = xml;
  }

  positionString(): string {
    return positionString(this.xloc, this.yloc);
  }

  /** Short label used to reference the note in change lists. */
  label(): string {
    const t = javaTrim(this.text).replace(JAVA_WHITESPACE_RUN, ' ');
    return t.length <= 40 ? t : t.substring(0, 37) + '...';
  }
}

/** A database connection definition. Secret values are redacted before they reach any output. */
export class ConnectionModel {
  readonly name: string;
  readonly xml: XmlNode | null;

  constructor(name: string | null, xml: XmlNode | null) {
    this.name = name === null ? '' : javaTrim(name);
    this.xml = xml;
  }

  toString(): string {
    return this.name;
  }
}

export type DocumentType = 'transformation' | 'job' | 'connection';

/** Parsed view of one document. */
export class TransformationModel {
  readonly name: string;
  readonly description: string;
  readonly info: XmlNode | null;
  readonly connections: readonly ConnectionModel[];
  readonly steps: readonly StepModel[];
  readonly hops: readonly HopModel[];
  readonly notes: readonly NoteModel[];
  readonly root: XmlNode;

  constructor(name: string | null, description: string | null, info: XmlNode | null,
    connections: readonly ConnectionModel[], steps: readonly StepModel[],
    hops: readonly HopModel[], notes: readonly NoteModel[], root: XmlNode) {
    this.name = name === null ? '' : javaTrim(name);
    this.description = description ?? '';
    this.info = info;
    this.connections = [...connections];
    this.steps = [...steps];
    this.hops = [...hops];
    this.notes = [...notes];
    this.root = root;
  }

  /** Original dialect of the projected document; the comparison model stays transport-neutral. */
  documentType(): DocumentType {
    if (this.root.path === '/job') return 'job';
    if (this.root.path === '/connection') return 'connection';
    return 'transformation';
  }

  stepByName(trimmedName: string): StepModel | null {
    for (const s of this.steps) {
      if (s.name === trimmedName) return s;
    }
    return null;
  }
}
