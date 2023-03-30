import { findDuplications } from './helpers';
import { BareSlice } from './slice';

export function expandSlices(slices: BareSlice[] = []): BareSlice[] {
  return slices.flatMap((slice) => {
    return [
      ...expandSlices(slice.spec.beforeSlices),
      slice,
      ...expandSlices(slice.spec.afterSlices),
    ];
  });
}

export function validateSlices(slices: BareSlice[]) {
  checkUniqueKeys(slices);
  checkUniqueLineage(slices);
  checkUniqDependency(slices);
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
    if (new Set(dependencies.map((d) => d.key)).size !== dependencies.length) {
      throw new Error(
        `Slice "${slice.key}" has duplicate dependencies: ${dependencies
          .map((d) => d.key)
          .join(', ')}`,
      );
    }
  }
}

function checkDependencyOrder(slices: BareSlice[]) {
  let seenKeys = new Set<string>();
  for (const slice of slices) {
    const dependencies = slice.spec.dependencies;
    if (dependencies !== undefined) {
      const depKeys = dependencies.map((d) => d.key);
      for (const depKey of depKeys) {
        if (!seenKeys.has(depKey)) {
          throw new Error(
            `Slice "${slice.key}" has a dependency on Slice "${depKey}" which is either not registered or is registered after this slice.`,
          );
        }
      }
    }
    seenKeys.add(slice.key);
  }
}

function circularCheck(slices: BareSlice[]) {
  const stack = new Set<string>();
  const visited = new Set<string>();

  const checkCycle = (slice: BareSlice): boolean => {
    const key = slice.key;
    if (stack.has(key)) return true;
    if (visited.has(key)) return false;

    visited.add(key);
    stack.add(key);

    for (const dep of slice.spec.dependencies) {
      if (checkCycle(dep)) {
        return true;
      }
    }
    stack.delete(key);
    return false;
  };

  for (const slice of slices) {
    const cycle = checkCycle(slice);
    if (cycle) {
      const path = [...stack];
      path.push(slice.key);

      throw new Error(
        `Circular dependency detected in slice "${
          slice.key
        }" with path ${path.join(' ->')}`,
      );
    }
  }
}
