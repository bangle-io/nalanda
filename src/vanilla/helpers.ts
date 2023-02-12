import { Action } from './public-types';
import { BareSlice } from './slice';

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

export function createAction<P extends any[], SS, DS extends BareSlice>(
  dependencies: DS[],
  opts: {
    initState: SS;
    action: Action<P, SS, DS>;
  },
): Action<P, SS, DS> {
  return opts.action;
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
