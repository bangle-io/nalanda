import { useDebugValue } from 'react';
import useSyncExternalStoreExports from 'use-sync-external-store/shim';

import type { Slice } from '../vanilla/slice';
import type { Store } from '../vanilla/store';

const { useSyncExternalStore } = useSyncExternalStoreExports;

export function createUseSliceHook<SSL extends Slice>(store: Store<SSL>) {
  return function useSlice<SL extends Slice>(
    sl: SL['key']['key'] extends SSL['key']['key'] ? SL : never,
  ) {
    const data: SL['key']['initState'] = useSyncExternalStore(
      (cb) => {
        return store._tempRegisterOnSyncChange(sl, cb);
      },
      () => {
        return sl.getState(store.state);
      },
    );

    useDebugValue(data);

    return data;
  };
}
