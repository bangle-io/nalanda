import {
  Slice,
  Store,
  _AnyExternal,
  _InferSliceFieldState,
  _ExposedSliceFieldNames,
} from '@nalanda/core';
import { useCallback, useRef } from 'react';
import useSyncExternalStoreExports from 'use-sync-external-store/shim';

const { useSyncExternalStore } = useSyncExternalStoreExports;

type Simplify<T> = { [KeyType in keyof T]: T[KeyType] } & {};

export function useTrack<
  TExternal extends _AnyExternal = any,
  TName extends string = any,
  TDep extends string = any,
>(
  slice: Slice<TExternal, TName, TDep>,
  store: Store<any>,
): Simplify<_InferSliceFieldState<TExternal>> {
  const ref = useRef<any>();

  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      const sliceEffect = store.effect((effectStore) => {
        ref.current = slice.track(effectStore);
        onStoreChange();
      });

      return () => {
        store.unregisterEffect(sliceEffect);
      };
    },
    [store, slice],
  );

  const getSnapshot = useCallback(() => {
    return ref.current ?? slice.get(store.state);
  }, [store, slice]);

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export function useTrackField<
  TExternal extends _AnyExternal = any,
  TName extends string = any,
  TDep extends string = any,
  TFieldName extends _ExposedSliceFieldNames<TExternal> = any,
>(
  slice: Slice<TExternal, TName, TDep>,
  fieldName: TFieldName,
  store: Store<any>,
): _InferSliceFieldState<TExternal>[TFieldName] {
  const ref = useRef<any>();

  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      const sliceEffect = store.effect((effectStore) => {
        ref.current = slice.trackField(effectStore, fieldName);
        onStoreChange();
      });

      return () => {
        store.unregisterEffect(sliceEffect);
      };
    },
    [store, slice, fieldName],
  );

  const getSnapshot = useCallback(() => {
    return ref.current ?? slice.getField(store.state, fieldName);
  }, [store, slice, fieldName]);

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
