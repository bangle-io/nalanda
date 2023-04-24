import { LineageId, StableSliceId } from './types';

const lineages: Record<string, number> = Object.create(null);
export function createLineageId(name: string): LineageId {
  if (name in lineages) return `l_${name}$${++lineages[name]}` as LineageId;
  lineages[name] = 0;
  return `l_${name}$` as LineageId;
}

export function createStableSliceId(id: string): StableSliceId {
  return id as StableSliceId;
}

export function isLineageId(id: unknown): id is LineageId {
  return typeof id === 'string' && id.startsWith('l_') && /\$\d*$/.test(id);
}

export function uuid(len = 10) {
  return Math.random().toString(36).substring(2, 15).slice(0, len);
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

export function reverseMap<K, V>(map: Map<K, V>): Map<V, K> {
  const reversed = new Map<V, K>();
  for (const [key, value] of map) {
    reversed.set(value, key);
  }
  return reversed;
}

export function assertNotUndefined(
  value: unknown,
  message: string,
): asserts value {
  if (value === undefined) {
    throw new Error(`assertion failed: ${message}`);
  }
}
