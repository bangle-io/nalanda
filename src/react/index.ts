import { useDebugValue } from 'react';
import { useSyncExternalStore } from 'use-sync-external-store';

import type { Slice } from '../slice';
import type { Store } from '../store';

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
