import { createStore, Slice, Store, StoreOptions } from '@nalanda/core';
import React, { useEffect, useState } from 'react';

const StoreContextSliceSymbol = Symbol('StoreContextKey');

export function getContextFromSlice(
  slice: Slice,
): React.Context<Store<any> | null> | undefined {
  return (slice as any)[StoreContextSliceSymbol];
}

function setContextInSlice(
  slice: Slice,
  context: React.Context<Store<any> | null> | undefined,
): void {
  (slice as any)[StoreContextSliceSymbol] = context;
}

export const StoreDefaultContext = React.createContext<Store | null>(null);

export function StoreProvider({
  store,
  children,
  context = StoreDefaultContext,
}: {
  store: Store<any>;
  children: React.ReactNode;
  context?: React.Context<Store<any> | null>;
}) {
  useEffect(() => {
    // TODO start effects
    store.options.slices.forEach((slice) => {
      const existing = getContextFromSlice(slice);
      if (existing === context) {
        return;
      }
      if (existing) {
        throw new Error(
          `Cannot create a context store with a slice that is already associated with another store. Please see https://nalanda.bangle.io/docs/react/common-errors/#store-context`,
        );
      }
      setContextInSlice(slice, context);
    });

    return () => {
      // TODO pause effects
    };
  }, [store, context]);

  return (
    <StoreDefaultContext.Provider value={store}>
      {children}
    </StoreDefaultContext.Provider>
  );
}

export function useStore<T extends string = any>(
  context = StoreDefaultContext,
): Store<T> {
  const store = React.useContext(StoreDefaultContext);
  if (!store) {
    throw new Error('Missing StoreProvider');
  }
  return store;
}
