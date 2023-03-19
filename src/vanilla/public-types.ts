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

export type Action<P extends any[], SS, DS extends BareSlice> = {
  (...payload: P): (sliceState: SS, storeState: StoreState<DS>) => SS;
  metadata?: Record<string | symbol, any>;
};

export type AnySlice = Slice<string, any, AnySlice, {}, {}>;
export type EmptySlice = Slice<never, {}, EmptySlice, {}, {}>;

export interface BareStore<SL extends BareSlice> {
  state: StoreState<SL>;
  dispatch: (tx: Transaction<SL['name'], any>, debugDispatch?: string) => void;
  destroy: () => void;
  destroyed: boolean;
}

export interface Effect<
  SL extends AnySlice,
  //   sibblings must include SL in their union
  Sibblings extends AnySlice = SL,
> {
  name?: string;
  destroy?: (
    slice: SL,
    state: StoreState<Sibblings>,
    ref: Record<string, any>,
  ) => void;
  init?: (
    slice: SL,
    store: BareStore<Sibblings>,
    ref: Record<string, any>,
  ) => void;
  updateSync?:
    | undefined
    | ((
        slice: SL,
        store: BareStore<Sibblings>,
        prevStoreState: StoreState<Sibblings>,
        ref: Record<string, any>,
      ) => void);
  update?:
    | undefined
    | ((
        slice: SL,
        store: BareStore<Sibblings>,
        prevStoreState: StoreState<Sibblings>,
        ref: Record<string, any>,
      ) => void);
}

export function typed<T>(value: T): T {
  return value;
}
