import type { SliceKey, SliceNameOpaque } from './internal-types';
import type {
  ActionBuilder,
  AnySlice,
  BareStore,
  EmptySlice,
  TxCreator,
} from './public-types';
import type { BareSlice, Slice } from './slice';
import type { Store } from './store';
import { Transaction } from './transaction';

const contextId = uuid(4);
let counter = 0;

export function incrementalId() {
  return `${contextId}-${counter++}`;
}

export function mapObjectValues<T, U>(
  obj: Record<string, T>,
  fn: (v: T, k: string) => U,
): Record<string, U> {
  const newObj: Record<string, U> = Object.create(null);

  for (const [key, value] of Object.entries(obj)) {
    newObj[key] = fn(value, key);
  }

  return newObj;
}

export function findDuplications<T>(arr: T[]): T[] {
  const seen = new Set<T>();
  const dupes = new Set<T>();

  for (const item of arr) {
    if (seen.has(item)) {
      dupes.add(item);
    } else {
      seen.add(item);
    }
  }

  return [...dupes];
}

export function weakCache<T extends object, R>(
  fn: (arg: T) => R,
): (arg: T) => R {
  const cache = new WeakMap<T, R>();
  const res = (arg: T): R => {
    if (cache.has(arg)) {
      return cache.get(arg)!;
    }

    const value = fn(arg);
    cache.set(arg, value);

    return value;
  };

  return res;
}

export function uuid(len = 10) {
  return Math.random().toString(36).substring(2, 15).slice(0, len);
}

export function calcDependencies(
  slices: BareSlice[],
): Record<string, Set<string>> {
  return Object.fromEntries(
    slices.map((slice) => [
      slice.key,
      new Set(slice.spec.dependencies.map((dep) => dep.key)),
    ]),
  );
}

export function flattenReverseDependencies(
  reverseDep: Record<string, Set<string>>,
) {
  const result: Record<string, Set<string>> = {};

  const recurse = (key: string) => {
    let vals = result[key];

    if (vals) {
      return vals;
    }

    vals = new Set<string>();
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
    recurse(key);
  }

  return result;
}

export function calcReverseDependencies(
  slices: BareSlice[],
): Record<string, Set<string>> {
  let reverseDependencies: Record<string, Set<string>> = {};

  for (const slice of slices) {
    for (const dep of slice.spec.dependencies) {
      let result = reverseDependencies[dep.key];

      if (!result) {
        result = new Set();
        reverseDependencies[dep.key] = result;
      }

      result.add(slice.key);
    }
  }

  return reverseDependencies;
}

// internal method for changing the type and accessing some methods
export function changeBareSlice<SL extends BareSlice>(
  slice: SL,
  cb: (sl: AnySlice) => AnySlice,
): SL {
  return cb(slice as unknown as AnySlice) as unknown as SL;
}

export function getSliceByKey(
  store: BareStore<any> | Store,
  key: SliceKey,
): AnySlice | undefined {
  return (store as Store).state.sliceLookupByKey[key] as AnySlice;
}

export function getActionBuilderByKey(
  store: BareStore<any> | Store,
  key: SliceKey,
  actionId: string,
): undefined | ActionBuilder<any[], any, any> {
  const slice: undefined | Slice<string, any, any, any, {}> = getSliceByKey(
    store,
    key,
  );

  return slice?.spec.actions?.[actionId];
}
