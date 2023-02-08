import { useDebugValue, useState } from 'react';
import useSyncExternalStoreExports from 'use-sync-external-store/shim';

import type { Slice } from '../vanilla/slice';
import type { Store } from '../vanilla/store';
import { InferSliceResolvedState } from '../vanilla/types';

const { useSyncExternalStore } = useSyncExternalStoreExports;

export function createUseSliceHook<SSL extends Slice>(store: Store<SSL>) {
  function useSlice<SL extends Slice>(
    sl: SL['key']['key'] extends SSL['key']['key'] ? SL : never,
  ): [SL['key']['initState'], Store<SSL>['dispatch']];
  function useSlice<SL extends Slice, SLS>(
    sl: SL['key']['key'] extends SSL['key']['key'] ? SL : never,
    selector: (state: InferSliceResolvedState<SL>) => SLS,
  ): [SLS, Store<SSL>['dispatch']];
  function useSlice<SL extends Slice, SLS>(
    sl: SL['key']['key'] extends SSL['key']['key'] ? SL : never,
    selector?: (p: SL['key']['initState']) => SLS,
  ): [SLS, Store<SSL>['dispatch']] {
    const [subscribe] = useState(() => {
      return (cb: () => void) => {
        return store._tempRegisterOnSyncChange(sl, cb);
      };
    });

    const [snap] = useState(() => {
      return () => {
        const result = sl.resolveState(store.state);
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
