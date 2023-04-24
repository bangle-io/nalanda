import { useDebugValue, useState } from 'react';
import useSyncExternalStoreExports from 'use-sync-external-store/shim';
import { Store } from '../vanilla';
import { AnySlice, AnySliceWithName } from '../vanilla/slice';

const { useSyncExternalStore } = useSyncExternalStoreExports;

export function createUseSliceHook<TAllSliceName extends string>(
  store: Store<TAllSliceName>,
) {
  function useSlice<TSlice extends AnySlice>(
    sl: TSlice extends AnySliceWithName<infer N>
      ? N extends TAllSliceName
        ? TSlice
        : never
      : never,
  ): [
    ReturnType<TSlice['resolveState']>,
    Store<TSlice extends AnySliceWithName<infer N> ? N : never>['dispatch'],
  ] {
    const [subscribe] = useState(() => {
      return (cb: () => void) => {
        return (store as any)._tempRegisterOnSyncChange(sl, cb);
      };
    });

    const [snap] = useState(() => {
      return () => {
        const result = sl.resolveState(store.state as any);
        return result;
      };
    });

    const data = useSyncExternalStore(subscribe, snap);

    useDebugValue(data);

    return [data, store.dispatch];
  }

  return useSlice;
}
