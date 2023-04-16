import { AnyFn, LineageId, VoidFn } from './internal-types';
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

export type ActionBuilder<P extends any[], SS, DS extends BareSlice> = {
  (...payload: P): (sliceState: SS, storeState: StoreState<DS>) => SS;
  setContextDetails?: (opts: {
    lineageId: LineageId;
    actionId: string;
  }) => void;
};

export type AnySlice = Slice<string, any, any, any, AnyFn>;

export type OpaqueSlice<N extends string> = Slice<N, {}, never, {}, VoidFn>;

export interface BareStore<SL extends BareSlice> {
  state: StoreState<SL>;
  dispatch: (tx: Transaction<SL['name'], any>, debugDispatch?: string) => void;
  destroy: () => void;
  destroyed: boolean;
}

export type AnyEffect = Effect<any, any, any, any, any>;

export interface Effect<
  N extends string,
  SS,
  DS extends AnySlice,
  A extends Record<string, TxCreator<N, any[]>>,
  SE extends SelectorFn<SS, DS, any>,
> {
  name?: string;
  destroy?: (
    slice: Slice<N, SS, DS, A, SE>,
    state: StoreState<Slice<N, SS, DS, A, SE> | DS>,
    ref: Record<string, any>,
  ) => void;
  init?: (
    slice: Slice<N, SS, DS, A, SE>,
    store: BareStore<Slice<N, SS, DS, A, SE> | DS>,
    ref: Record<string, any>,
  ) => void;
  updateSync?:
    | undefined
    | ((
        slice: Slice<N, SS, DS, A, SE>,
        store: BareStore<Slice<N, SS, DS, A, SE> | DS>,
        prevStoreState: StoreState<Slice<N, SS, DS, A, SE> | DS>,
        ref: Record<string, any>,
      ) => void);
  update?:
    | undefined
    | ((
        slice: Slice<N, SS, DS, A, SE>,
        store: BareStore<Slice<N, SS, DS, A, SE> | DS>,
        prevStoreState: StoreState<Slice<N, SS, DS, A, SE> | DS>,
        ref: Record<string, any>,
      ) => void);
}

export function typed<T>(value: T): T {
  return value;
}
