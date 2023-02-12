export class KeyMapping {
  constructor(private _mapping: Record<string, string>) {}

  augment(augmentWith: string, keys: string[]): KeyMapping {
    const mapping = { ...this._mapping };

    for (const key of keys) {
      const existing = mapping[key] || key;

      mapping[key] = augmentWith + ':' + existing;
    }

    return new KeyMapping(mapping);
  }

  get(key: string): string | undefined {
    return this._mapping[key];
  }
}
