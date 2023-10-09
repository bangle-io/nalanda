import {
  createStore as createVanillaStore,
  Slice,
  Store,
  StoreOptions,
} from '@nalanda/core';
import { useEffect, useState } from 'react';

export interface ContextStoreOptions<TSliceName extends string>
  extends StoreOptions<TSliceName> {
  /**
   * The react context object created using React.createContext()
   */
  context: React.Context<Store<any> | null>;
}

export const StoreContextSymbol = Symbol('StoreContextKey');

function getContextFromSlice(
  slice: Slice,
): React.Context<Store<any> | null> | undefined {
  return (slice as any)[StoreContextSymbol];
}

function setContextInSlice(
  slice: Slice,
  context: React.Context<Store<any> | null> | undefined,
): void {
  (slice as any)[StoreContextSymbol] = context;
}

export function createContextStore<TSliceName extends string = any>(
  options: ContextStoreOptions<TSliceName>,
): Store<TSliceName> {
  options.slices.forEach((slice) => {
    const existing = getContextFromSlice(slice);
    if (existing === options.context) {
      return;
    }
    if (existing) {
      throw new Error(
        `Cannot create a context store with a slice that is already associated with another store. Please see https://nalanda.bangle.io/docs/react/common-errors/#store-context`,
      );
    }
    setContextInSlice(slice, options.context);
  });

  return createVanillaStore(options);
}

/**
 * A hook to create a store to be used in a react application.
 * @param options
 * @returns
 */
export function useCreateStore<TSliceName extends string = any>(
  options: ContextStoreOptions<TSliceName>,
): Store<TSliceName> {
  const [store] = useState(() => createContextStore(options));

  useEffect(() => {
    return () => {
      store.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return store;
}
