import { BaseStore } from './base-store';

export type RefObject<T> = {
  current: T;
};

export function ref<T>(store: BaseStore<any>, initValue: T): RefObject<T> {
  return {
    current: initValue,
  };
}

export function sharedRef<T>(
  initValue: T,
): (store: BaseStore<any>) => RefObject<T> {
  return (store) => {
    return ref(store, initValue);
  };
}
