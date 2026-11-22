// Port of java-diff-utils 4.12 (com.github.difflib): MyersDiff, PathNode, Patch.generate and
// Patch.getDeltas as used by DiffUtils.diff(List, List) without equal parts.
//
/*! java-diff-utils 4.12 (ported to TypeScript in KTRDiff). Copyright 2009-2017 java-diff-utils.
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file
 * except in compliance with the License. You may obtain a copy of the License at
 * http://www.apache.org/licenses/LICENSE-2.0
 * Unless required by applicable law or agreed to in writing, software distributed under the
 * License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND,
 * either express or implied. See the License for the specific language governing permissions
 * and limitations under the License.
 * (A legal comment, so esbuild keeps it in the single-file CLI bundle.) */
//
// Modified for KTRDiff: translated to TypeScript, progress listener and generic equalizer
// removed (strings compared with ===). Operation order and tie-breaks are kept literally, since
// they decide which lines a delta reports.

export type DeltaType = 'CHANGE' | 'DELETE' | 'INSERT';

export interface Chunk<T> {
  readonly position: number;
  readonly lines: readonly T[];
}

export interface Delta<T> {
  readonly type: DeltaType;
  readonly source: Chunk<T>;
  readonly target: Chunk<T>;
}

class PathNode {
  readonly i: number;
  readonly j: number;
  readonly prev: PathNode | null;
  readonly snake: boolean;
  readonly bootstrap: boolean;

  constructor(i: number, j: number, snake: boolean, bootstrap: boolean, prev: PathNode | null) {
    this.i = i;
    this.j = j;
    this.bootstrap = bootstrap;
    // non-snake nodes skip straight to the previous snake, so consecutive edits merge
    this.prev = snake ? prev : prev === null ? null : prev.previousSnake();
    this.snake = snake;
  }

  previousSnake(): PathNode | null {
    if (this.bootstrap) return null;
    if (!this.snake && this.prev !== null) return this.prev.previousSnake();
    return this;
  }
}

interface RawChange {
  readonly type: DeltaType;
  readonly startOriginal: number;
  readonly endOriginal: number;
  readonly startRevised: number;
  readonly endRevised: number;
}

function buildPath<T>(orig: readonly T[], rev: readonly T[]): PathNode {
  const N = orig.length;
  const M = rev.length;
  const MAX = N + M + 1;
  const size = 1 + 2 * MAX;
  const middle = Math.trunc(size / 2);
  const diagonal: (PathNode | null)[] = new Array<PathNode | null>(size).fill(null);

  diagonal[middle + 1] = new PathNode(0, -1, true, true, null);
  for (let d = 0; d < MAX; d++) {
    for (let k = -d; k <= d; k += 2) {
      const kmiddle = middle + k;
      const kplus = kmiddle + 1;
      const kminus = kmiddle - 1;
      let prev: PathNode;
      let i: number;
      if (k === -d || (k !== d && diagonal[kminus]!.i < diagonal[kplus]!.i)) {
        i = diagonal[kplus]!.i;
        prev = diagonal[kplus]!;
      } else {
        i = diagonal[kminus]!.i + 1;
        prev = diagonal[kminus]!;
      }
      diagonal[kminus] = null; // no longer used

      let j = i - k;
      let node = new PathNode(i, j, false, false, prev);
      while (i < N && j < M && orig[i] === rev[j]) {
        i++;
        j++;
      }
      if (i !== node.i) {
        node = new PathNode(i, j, true, false, node);
      }
      diagonal[kmiddle] = node;
      if (i >= N && j >= M) {
        return node;
      }
    }
    diagonal[middle + d - 1] = null;
  }
  // According to Myers, this cannot happen
  throw new Error('could not find a diff path');
}

function buildRevision(actualPath: PathNode): RawChange[] {
  let path: PathNode | null = actualPath;
  const changes: RawChange[] = [];
  if (path.snake) path = path.prev;
  while (path !== null && path.prev !== null && path.prev.j >= 0) {
    if (path.snake) throw new Error('bad diffpath: found snake when looking for diff');
    const i: number = path.i;
    const j: number = path.j;
    path = path.prev;
    const ianchor = path.i;
    const janchor = path.j;
    let type: DeltaType;
    if (ianchor === i && janchor !== j) type = 'INSERT';
    else if (ianchor !== i && janchor === j) type = 'DELETE';
    else type = 'CHANGE';
    changes.push({ type, startOriginal: ianchor, endOriginal: i, startRevised: janchor, endRevised: j });
    if (path.snake) path = path.prev;
  }
  return changes;
}

/** DiffUtils.diff(original, revised).getDeltas(): deltas sorted by source position. */
export function diffDeltas<T>(original: readonly T[], revised: readonly T[]): Delta<T>[] {
  const changes = buildRevision(buildPath(original, revised));
  const deltas: Delta<T>[] = changes.map((c) => ({
    type: c.type,
    source: { position: c.startOriginal, lines: original.slice(c.startOriginal, c.endOriginal) },
    target: { position: c.startRevised, lines: revised.slice(c.startRevised, c.endRevised) },
  }));
  // Patch.getDeltas sorts by source position (List.sort is stable, like Array.prototype.sort)
  deltas.sort((a, b) => a.source.position - b.source.position);
  return deltas;
}
