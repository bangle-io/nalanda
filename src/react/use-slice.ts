import { useDebugValue, useState } from 'react';
import useSyncExternalStoreExports from 'use-sync-external-store/shim';
import { AnySlice, BareStore } from '../vanilla/public-types';

import { StoreState } from '../vanilla/state';
import type { Store } from '../vanilla/store';

const { useSyncExternalStore } = useSyncExternalStoreExports;

export function createUseSliceHook<SSL extends AnySlice>(
  store: BareStore<SSL>,
) {
  function useSlice<SL extends AnySlice>(
    sl: SL['key'] extends SSL['key'] ? SL : never,
  ): [ReturnType<SL['resolveState']>, BareStore<SSL>['dispatch']];
  function useSlice<SL extends AnySlice, SLS>(
    sl: SL['key'] extends SSL['key'] ? SL : never,
    selector: (state: ReturnType<SL['resolveState']>) => SLS,
  ): [SLS, BareStore<SSL>['dispatch']];
  function useSlice<SL extends AnySlice, SLS>(
    sl: SL['key'] extends SSL['key'] ? SL : never,
    selector?: (p: SL['config']['initState']) => SLS,
  ): [SLS, BareStore<SSL>['dispatch']] {
    const [subscribe] = useState(() => {
      return (cb: () => void) => {
        return (store as Store)._tempRegisterOnSyncChange(sl, cb);
      };
    });

    const [snap] = useState(() => {
      return () => {
        const result = sl.resolveState(store.state as StoreState<any>);
        if (selector) {
          return selector(result);
        }
        return result;
      };
    });

    const data = useSyncExternalStore(subscribe, snap);

    useDebugValue(data);

    return [data, store.dispatch];
  }

  return useSlice;
}
