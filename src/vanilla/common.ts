import type { AnySliceBase } from './types';

export const expectType = <Type>(_: Type): void => void 0;

export function assertNotUndefined(
  value: unknown,
  message: string,
): asserts value {
  if (value === undefined) {
    throw new Error(`assertion failed: ${message}`);
  }
}

export function typed<T>(value: T): T {
  return value;
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

export function objectHasOwnProperty<X extends {}, Y extends PropertyKey>(
  obj: X,
  prop: Y,
): obj is X & Record<Y, unknown> {
  return Object.prototype.hasOwnProperty.call(obj, prop);
}

export function calcReverseDependencies(
  slices: AnySliceBase[],
): Record<string, Set<string>> {
  let reverseDependencies: Record<string, Set<string>> = {};

  for (const slice of slices) {
    for (const dep of slice.key.dependencies) {
      let result = reverseDependencies[dep.key.key];

      if (!result) {
        result = new Set();
        reverseDependencies[dep.key.key] = result;
      }

      result.add(slice.key.key);
    }
  }

  return reverseDependencies;
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

export function calcDependencies(
  slices: AnySliceBase[],
): Record<string, Set<string>> {
  return Object.fromEntries(
    slices.map((slice) => [
      slice.key.key,
      new Set(slice.key.dependencies.map((dep) => dep.key.key)),
    ]),
  );
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
