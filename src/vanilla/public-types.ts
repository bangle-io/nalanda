import type { BareSlice, Slice } from './slice';
import type { StoreState } from './state';
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

export interface BareStore<SL extends BareSlice> {
  state: StoreState<SL>;
  dispatch: (tx: Transaction<SL['key'], any>, debugDispatch?: string) => void;
  destroy: () => void;
  destroyed: boolean;
}

export interface Effect<
  SL extends AnySlice,
  //   sibblings must include SL in their union
  Sibblings extends AnySlice = SL,
> {
  name?: string;
  destroy?: (slice: SL, state: StoreState<Sibblings>) => void;
  init?: (slice: SL, store: BareStore<Sibblings>) => void;
  updateSync?:
    | undefined
    | ((
        slice: SL,
        store: BareStore<Sibblings>,
        prevStoreState: StoreState<Sibblings>,
      ) => void);
  update?:
    | undefined
    | ((
        slice: SL,
        store: BareStore<Sibblings>,
        prevStoreState: StoreState<Sibblings>,
      ) => void);
}
