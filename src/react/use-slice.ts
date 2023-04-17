import { useDebugValue, useState } from 'react';
import useSyncExternalStoreExports from 'use-sync-external-store/shim';
import { AnySlice, BareStore } from '../vanilla/public-types';

import { StoreState } from '../vanilla/state';

const { useSyncExternalStore } = useSyncExternalStoreExports;

export function createUseSliceHook(store: BareStore<any>) {
  function useSlice<SL extends AnySlice>(
    sl: SL,
  ): [ReturnType<SL['resolveState']>, BareStore<SL>['dispatch']] {
    const [subscribe] = useState(() => {
      return (cb: () => void) => {
        return (store as any)._tempRegisterOnSyncChange(sl, cb);
      };
    });

    const [snap] = useState(() => {
      return () => {
        const result = sl.resolveState(store.state);
        return result;
      };
    });

    const data = useSyncExternalStore(subscribe, snap);

    useDebugValue(data);

    return [data as any, store.dispatch];
  }

  return useSlice;
}
