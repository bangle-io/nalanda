import {
  createStore as createVanillaStore,
  Store,
  StoreOptions,
} from '@nalanda/core';

export interface ContextStoreOptions<TSliceName extends string>
  extends StoreOptions<TSliceName> {
  /**
   * The react context object created using React.createContext()
   */
  context: React.Context<Store<any> | null>;
}

export const StoreContextSymbol = Symbol('StoreContextKey');

export function createContextStore<TSliceName extends string = any>(
  options: ContextStoreOptions<TSliceName>,
): Store<TSliceName> {
  options.slices.forEach((slice) => {
    // @ts-expect-error - this is a private symbol
    if (slice[StoreContextSymbol]) {
      throw new Error(
        `Cannot create a context store with a slice that is already associated with another store. Please see https://nalanda.bangle.io/docs/react/common-errors/#store-context`,
      );
    }
    // @ts-expect-error - this is a private symbol
    slice[StoreContextSymbol] = options.context;
  });

  const store = createVanillaStore(options);

  store.destroySignal.addEventListener(
    'abort',
    () => {
      options.slices.forEach((slice) => {
        // @ts-expect-error - this is a private symbol
        delete slice[StoreContextSymbol];
      });
    },
    { once: true },
  );

  return store;
}
