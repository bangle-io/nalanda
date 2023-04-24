import { createStableSliceId, findDuplications, reverseMap } from './helpers';

import type { UnknownSlice } from './slice';
import { LineageId, StableSliceId } from './types';

export interface ExpandSlice<SL extends UnknownSlice> {
  slices: SL[];
  pathMap: Record<LineageId, StableSliceId>;
  reversePathMap: Record<StableSliceId, LineageId>;
}

export function expandSlices<SL extends UnknownSlice>(
  slices: SL[] = [],
): ExpandSlice<SL> {
  // TODO improve the stability of StableSliceID by
  // accounting for slice dependencies, state and anything else
  // so that the same source code will always produce the same in different
  // environments. Currently, it generates the same slice id as long as the name
  // is the same, which can be problematic if somehow two slices have same name.
  // DO note getting to the ideal state is impossible, and lineageId should be used
  // for most purposes unless cross environment compatibility is needed.

  const pathMap = new Map<LineageId, StableSliceId>();

  const expand = (
    slices: UnknownSlice[] = [],
    parentPrefix: string,
  ): UnknownSlice[] => {
    return slices.flatMap((slice) => {
      const prefix = createStableSliceId(parentPrefix + slice.spec.name);
      pathMap.set(slice.spec.lineageId, prefix);

      return [
        ...expand(slice.spec.beforeSlices, prefix + '.'),
        slice,
        ...expand(slice.spec.afterSlices, prefix + '.'),
      ];
    });
  };

  return {
    slices: expand(slices, '') as SL[],
    pathMap: Object.fromEntries(pathMap.entries()),
    reversePathMap: Object.fromEntries(reverseMap(pathMap).entries()),
  };
}

export function validateSlices(slices: UnknownSlice[]) {
  checkUniqDependency(slices);
  checkUniqueLineage(slices);
  circularCheck(slices);
  checkDependencyOrder(slices);
}

export function validatePathMap(
  pathMap: Record<LineageId, StableSliceId>,
  reversePathMap: Record<StableSliceId, LineageId>,
) {
  if (Object.keys(pathMap).length !== Object.keys(reversePathMap).length) {
    throw new Error('Path map is not valid');
  }
}

export function checkUniqueLineage(slices: UnknownSlice[]) {
  const dups = checkUnique(slices.map((s) => s.spec.lineageId));
  if (dups) {
    throw new Error('Duplicate slice lineageIds ' + dups.join(', '));
  }
}

function checkUnique<T>(entities: T[]): T[] | undefined {
  const unique = new Set(entities);

  if (entities.length !== unique.size) {
    return findDuplications(entities);
  }

  return;
}

// TODO add test
function checkUniqDependency(slices: UnknownSlice[]) {
  for (const slice of slices) {
    const dependencies = slice.spec.dependencies;
    if (
      new Set(dependencies.map((d) => d.spec.lineageId)).size !==
      dependencies.length
    ) {
      throw new Error(
        `Slice "${slice.spec.name}" has duplicate dependencies: ${dependencies
          .map((d) => d.spec.lineageId)
          .join(', ')}`,
      );
    }
  }
}

function checkDependencyOrder(slices: UnknownSlice[]) {
  let seenLineageIds = new Set<string>();
  for (const slice of slices) {
    const dependencies = slice.spec.dependencies;
    if (dependencies !== undefined) {
      const depKeys = dependencies.map((d) => d.spec.lineageId);
      for (const depKey of depKeys) {
        if (!seenLineageIds.has(depKey)) {
          throw new Error(
            `Slice "${slice.spec.lineageId}" has a dependency on Slice "${depKey}" which is either not registered or is registered after this slice.`,
          );
        }
      }
    }
    seenLineageIds.add(slice.spec.lineageId);
  }
}

function circularCheck(slices: UnknownSlice[]) {
  const stack = new Set<string>();
  const visited = new Set<string>();

  const checkCycle = (slice: UnknownSlice): boolean => {
    const lineageId = slice.spec.lineageId;
    if (stack.has(lineageId)) return true;
    if (visited.has(lineageId)) return false;

    visited.add(lineageId);
    stack.add(lineageId);

    for (const dep of slice.spec.dependencies) {
      if (checkCycle(dep)) {
        return true;
      }
    }
    stack.delete(lineageId);
    return false;
  };

  for (const slice of slices) {
    const cycle = checkCycle(slice);
    if (cycle) {
      const path = [...stack];
      path.push(slice.spec.lineageId);

      throw new Error(
        `Circular dependency detected in slice "${
          slice.spec.lineageId
        }" with path ${path.join(' ->')}`,
      );
    }
  }
}

export const createSliceLineageLookup = (
  slices: UnknownSlice[],
): Record<LineageId, UnknownSlice> => {
  return Object.fromEntries(slices.map((s) => [s.spec.lineageId, s]));
};

export function flattenReverseDependencies(
  reverseDep: Record<LineageId, Set<LineageId>>,
) {
  const result: Record<LineageId, Set<LineageId>> = {};

  const recurse = (key: LineageId) => {
    let vals = result[key];

    if (vals) {
      return vals;
    }

    vals = new Set<LineageId>();
    result[key] = vals;

    const deps = reverseDep[key];

    if (deps) {
      for (const dep of deps) {
        vals.add(dep);
        for (const v of recurse(dep)) {
          vals.add(v);
        }
      }
    }

    return vals;
  };

  for (const key of Object.keys(reverseDep)) {
    recurse(key as LineageId);
  }

  return result;
}

// TODO: move this to be an internal method as we only use flattenReverseDependencies
export function calcReverseDependencies(
  slices: UnknownSlice[],
): Record<LineageId, Set<LineageId>> {
  const reverseDependencies: Record<LineageId, Set<LineageId>> = {};

  for (const slice of slices) {
    for (const dep of slice.spec.dependencies) {
      let result = reverseDependencies[dep.spec.lineageId];

      if (!result) {
        result = new Set();
        reverseDependencies[dep.spec.lineageId] = result;
      }

      result.add(slice.spec.lineageId);
    }
  }

  return reverseDependencies;
}
