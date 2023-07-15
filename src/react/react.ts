import { useDebugValue, useState } from 'react';
import useSyncExternalStoreExports from 'use-sync-external-store/shim';

import type { Slice } from '../vanilla/slice';
import type { Store } from '../vanilla/store';
import type { AnySlice } from '../vanilla/types';

const { useSyncExternalStore } = useSyncExternalStoreExports;

type InferData<T> = T extends Slice<any, infer TData, any> ? TData : never;

interface ReactAdapter<TSnapshot> {
  subscribe: (onStoreChange: () => void) => () => void;
  getSnapshot: () => TSnapshot;
}

export function createUseSliceHook<TAllSliceName extends string = any>(
  store: Store<TAllSliceName>,
) {
  function useSlice<TSlice extends AnySlice, TSelectedData>(
    sl: TSlice,
    cb: (data: InferData<TSlice>) => TSelectedData,
  ): [TSelectedData, Store<TAllSliceName>['dispatch']] {
    const [adapter] = useState(() => {
      const adapter: ReactAdapter<TSelectedData> = {
        subscribe: (onStoreChange) => {
          const sliceEffect = store.effect((effectStore) => {
            const selectedData = sl.track(effectStore);
            let response = cb(selectedData);

            // if the user returned the same object, we need to trigger tracking
            // for all fields. Tracking is done implicitly by reading a field
            if (response === selectedData) {
              Object.entries(selectedData).forEach(([key, value]) => {
                // iterate over all values to trigger tracking
              });
            }
            onStoreChange();
          });

          return () => {
            store.unregisterEffect(sliceEffect);
          };
        },
        getSnapshot: () => {
          const val = sl.get(store.state);

          return cb(val);
        },
      };

      return adapter;
    });

    const data = useSyncExternalStore(adapter.subscribe, adapter.getSnapshot);

    useDebugValue(data);

    return [data, store.dispatch];
  }

  return useSlice;
}
