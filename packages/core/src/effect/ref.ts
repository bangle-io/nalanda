import type { BaseStore } from '../base-store';
import { Store } from '../store';

export type RefObject<T> = {
  current: T;
};

export function ref<T>(
  init: () => T,
): (store: Store<any> | BaseStore) => RefObject<T> {
  const cache = new WeakMap<Store<any>, RefObject<T>>();

  return (store) => {
    const rootStore: Store<any> =
      store instanceof Store ? store : store._rootStore;

    let existing = cache.get(rootStore);

    if (!existing) {
      existing = {
        current: init(),
      };
      cache.set(rootStore, existing);
    }

    return existing;
  };
}
