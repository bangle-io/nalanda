import { useDebugValue } from 'react';
import useSyncExternalStoreExports from 'use-sync-external-store/shim';

import type { Slice } from '../vanilla/slice';
import type { Store } from '../vanilla/store';

const { useSyncExternalStore } = useSyncExternalStoreExports;

export function useSlice<S extends Slice>(
  slice: S,
  store: Store<any>,
): S['key']['initState'] {
  let data: S['key']['initState'] = useSyncExternalStore(
    (cb) => {
      return store._tempRegisterOnChange(cb);
    },
    () => {
      return slice.getState(store?.state);
    },
  );

  useDebugValue(data);

  return data;
}
