import { findDuplications } from './helpers';
import { LineageId } from './internal-types';
import { BareSlice } from './slice';

export function expandSlices(slices: BareSlice[] = []): {
  slices: BareSlice[];
  pathMap: Map<LineageId, string>;
} {
  const pathMap = new Map<LineageId, string>();

  const expand = (
    slices: BareSlice[] = [],
    parentPrefix: string,
  ): BareSlice[] => {
    return slices.flatMap((slice) => {
      const prefix = parentPrefix + slice.name;
      pathMap.set(slice.lineageId, prefix);

      return [
        ...expand(slice.spec.beforeSlices, prefix + '.'),
        slice,
        ...expand(slice.spec.afterSlices, prefix + '.'),
      ];
    });
  };

  return { slices: expand(slices, ''), pathMap };
}

export function validateSlices(slices: BareSlice[]) {
  checkUniqDependency(slices);
  checkUniqueKeys(slices);
  checkUniqueLineage(slices);
  circularCheck(slices);
  checkDependencyOrder(slices);
}

export function checkUniqueKeys(slices: BareSlice[]) {
  const dups = checkUnique(slices.map((s) => s.key));
  if (dups) {
    throw new Error('Duplicate slice keys ' + dups.join(', '));
  }
}

export function checkUniqueLineage(slices: BareSlice[]) {
  const dups = checkUnique(slices.map((s) => s.lineageId));
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
function checkUniqDependency(slices: BareSlice[]) {
  for (const slice of slices) {
    const dependencies = slice.spec.dependencies;
    if (
      new Set(dependencies.map((d) => d.lineageId)).size !== dependencies.length
    ) {
      throw new Error(
        `Slice "${slice.name}" has duplicate dependencies: ${dependencies
          .map((d) => d.lineageId)
          .join(', ')}`,
      );
    }
  }
}

function checkDependencyOrder(slices: BareSlice[]) {
  let seenLineageIds = new Set<string>();
  for (const slice of slices) {
    const dependencies = slice.spec.dependencies;
    if (dependencies !== undefined) {
      const depKeys = dependencies.map((d) => d.lineageId);
      for (const depKey of depKeys) {
        if (!seenLineageIds.has(depKey)) {
          throw new Error(
            `Slice "${slice.lineageId}" has a dependency on Slice "${depKey}" which is either not registered or is registered after this slice.`,
          );
        }
      }
    }
    seenLineageIds.add(slice.lineageId);
  }
}

function circularCheck(slices: BareSlice[]) {
  const stack = new Set<string>();
  const visited = new Set<string>();

  const checkCycle = (slice: BareSlice): boolean => {
    const lineageId = slice.lineageId;
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
      path.push(slice.lineageId);

      throw new Error(
        `Circular dependency detected in slice "${
          slice.lineageId
        }" with path ${path.join(' ->')}`,
      );
    }
  }
}
