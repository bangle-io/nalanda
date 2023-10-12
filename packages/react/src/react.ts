import {
  Slice,
  Store,
  _AnyExternal,
  _InferSliceFieldState,
  _ExposedSliceFieldNames,
} from '@nalanda/core';
import { useCallback, useContext, useRef } from 'react';
import useSyncExternalStoreExports from 'use-sync-external-store/shim';
import { StoreDefaultContext, getContextFromSlice } from './store';

const { useSyncExternalStore } = useSyncExternalStoreExports;

// eslint-disable-next-line @typescript-eslint/ban-types
type Simplify<T> = { [KeyType in keyof T]: T[KeyType] } & {};

function useStoreFromContext(slice: Slice, store?: Store<any>): Store<any> {
  const ctxStore = useContext(
    getContextFromSlice(slice) ||
      // default value to null so that we can later we can use arg store
      StoreDefaultContext,
  );

  // the arg store takes precedence over the context store
  const resultStore = store || ctxStore;

  if (!resultStore) {
    throw new Error(
      `Could not find a store for slice ${slice.name}. Please ensure 'StoreProvider' is setup correctly or directly pass the store to the hook.`,
    );
  }

  return resultStore;
}

export function useTrack<
  TExternal extends _AnyExternal = any,
  TName extends string = any,
  TDep extends string = any,
>(
  slice: Slice<TExternal, TName, TDep>,
  store?: Store<any>,
): Simplify<_InferSliceFieldState<TExternal>> {
  const ref = useRef<any>();

  const _store = useStoreFromContext(slice, store);

  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      const sliceEffect = _store.effect((effectStore) => {
        ref.current = slice.track(effectStore);
        onStoreChange();
      });

      return () => {
        _store.destroyEffect(sliceEffect);
      };
    },
    [_store, slice],
  );

  const getSnapshot = useCallback(() => {
    return ref.current || slice.get(_store.state);
  }, [_store, slice]);

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
  store?: Store<any>,
): _InferSliceFieldState<TExternal>[TFieldName] {
  const ref = useRef<{ value: any } | null>(null);

  const _store = useStoreFromContext(slice, store);

  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      const sliceEffect = _store.effect((effectStore) => {
        if (!ref.current) {
          ref.current = { value: undefined };
        }
        ref.current.value = slice.trackField(effectStore, fieldName);
        onStoreChange();
      });

      return () => {
        _store.destroyEffect(sliceEffect);
      };
    },
    [_store, slice, fieldName],
  );

  const getSnapshot = useCallback(() => {
    return ref.current
      ? ref.current.value
      : slice.getField(_store.state, fieldName);
  }, [_store, slice, fieldName]);

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
