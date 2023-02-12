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
