import { BaseField, Slice, Store } from '@nalanda/core';
import { useCallback, useRef, useState } from 'react';
import useSyncExternalStoreExports from 'use-sync-external-store/shim';

const { useSyncExternalStore } = useSyncExternalStoreExports;

type MapSliceState<TFieldsSpec extends Record<string, BaseField<any>>> = {
  [K in keyof TFieldsSpec]: TFieldsSpec[K] extends BaseField<infer T>
    ? T
    : never;
};

export function useTrack<
  TFieldsSpec extends Record<string, BaseField<any>> = any,
  TName extends string = any,
  TDep extends string = any,
>(
  slice: Slice<TFieldsSpec, TName, TDep>,
  store: Store<any>,
): MapSliceState<TFieldsSpec> {
  const ref = useRef<MapSliceState<TFieldsSpec>>();

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
  TFieldsSpec extends Record<string, BaseField<any>> = any,
  TName extends string = any,
  TDep extends string = any,
  TFieldName extends keyof TFieldsSpec = any,
>(
  slice: Slice<TFieldsSpec, TName, TDep>,
  fieldName: TFieldName,
  store: Store<any>,
): MapSliceState<TFieldsSpec>[TFieldName] {
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
