import { DerivativeStore } from './base-store';
import { Store } from './store';

export type RefObject<T> = {
  current: T;
};

export function ref<T>(
  init: () => T,
): (store: DerivativeStore<any>) => RefObject<T> {
  const cache = new WeakMap<Store<any>, RefObject<T>>();

  return (store: DerivativeStore<any>) => {
    const rootStore = store._rootStore;

    if (!rootStore) {
      throw new Error(
        'Trying to access ref in a destroyed store ' + store.name,
      );
    }

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
