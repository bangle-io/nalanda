import type { BareSlice, Slice } from './slice';
import type { InternalStoreState, StoreState } from './state';
import type { ReducedStore, Store } from './store';
import type { Transaction } from './transaction';

export type SelectorFn<SS, DS extends BareSlice, T> = (
  sliceState: SS,
  storeState: StoreState<DS>,
) => T;

export type TxCreator<K extends string = any, P extends unknown[] = any> = (
  ...payload: P
) => Transaction<K, P>;

export type Action<P extends any[], SS, DS extends BareSlice> = (
  ...payload: P
) => (sliceState: SS, storeState: StoreState<DS>) => SS;

export type AnySlice = Slice<string, any, any, any, any>;

export interface Effect<
  SL extends AnySlice,
  //   sibblings must include SL in their union
  Sibblings extends AnySlice = SL,
> {
  name?: string;
  destroy?: (slice: SL, state: StoreState<Sibblings>) => void;
  init?: (slice: SL, store: ReducedStore<Sibblings>) => void;
  updateSync?:
    | undefined
    | ((
        slice: SL,
        store: ReducedStore<Sibblings>,
        prevStoreState: StoreState<Sibblings>,
      ) => void);
  update?:
    | undefined
    | ((
        slice: SL,
        store: ReducedStore<Sibblings>,
        prevStoreState: StoreState<Sibblings>,
      ) => void);
}
