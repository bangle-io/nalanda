import type { Slice } from './slice';
import type { ReducedStore } from './store';
import type { StoreState } from './state';
import type { Transaction } from './transaction';

export type Action = () => void;

export const expectType = <Type>(_: Type): void => void 0;
export type IfAny<T, Y, N> = 0 extends 1 & T ? Y : N;

export function rejectAny<K extends IfAny<K, never, unknown>>(key: K): void {}

export type InferSliceName<T> = T extends Slice<infer N, any, any, any>
  ? N
  : never;

export type ValidStoreState<
  TInputSliceNames extends string,
  TSliceName extends string,
> = TSliceName extends TInputSliceNames ? StoreState<TInputSliceNames> : never;

export type PickOpts = {
  ignoreChanges?: boolean;
};

export type DerivedStateFn<
  N extends string,
  TState,
  TDependency extends string,
  TDerivedState,
> = (
  initStoreState: StoreState<N | TDependency>,
  slice: Slice<N, TState, TDependency, never>,
) => (storeState: StoreState<N | TDependency>) => TDerivedState;

export type TransactionBuilder<N extends string, P extends unknown[]> = (
  ...payload: P
) => Transaction<N, P>;

// export type AnyEffect = Effect<any, any, any, any>;

export type UnknownEffect = Effect<string, unknown, string, unknown>;

export type ActionBuilder<
  P extends unknown[],
  TState,
  TDependency extends string,
> = {
  (...payload: P): (
    sliceState: TState,
    storeState: StoreState<TDependency>,
  ) => TState;
  setContextDetails?: (opts: {
    lineageId: LineageId;
    actionId: string;
  }) => void;
};

export interface Effect<
  N extends string,
  TState,
  TDependency extends string,
  TDerivedState,
> {
  name?: string;
  destroy?: (
    slice: Slice<N, TState, TDependency, TDerivedState>,
    state: StoreState<N | TDependency>,
    ref: Record<string, any>,
  ) => void;
  init?: (
    slice: Slice<N, TState, TDependency, TDerivedState>,
    store: ReducedStore<N | TDependency>,
    ref: Record<string, any>,
  ) => void;
  updateSync?:
    | undefined
    | ((
        slice: Slice<N, TState, TDependency, TDerivedState>,
        store: ReducedStore<N | TDependency>,
        prevStoreState: StoreState<N | TDependency>,
        ref: Record<string, any>,
      ) => void);
  update?:
    | undefined
    | ((
        slice: Slice<N, TState, TDependency, TDerivedState>,
        store: ReducedStore<N | TDependency>,
        prevStoreState: StoreState<N | TDependency>,
        ref: Record<string, any>,
      ) => void);
}
/**
 * Hack for nominal typing
 * https://basarat.gitbook.io/typescript/main-1/nominaltyping
 */
declare const __brand: unique symbol;
export type Brand<T, K> = T & { [__brand]: K };

export type LineageId = Brand<string, 'LineageId'>;
export type OpqSliceState = Brand<string, 'OpqSliceState'>;

export type StableSliceId = Brand<string, 'StableSliceId'>;

export type ExtractReturnTypes<
  T extends Record<string, (...args: any[]) => any>,
> = {
  [K in keyof T]: T[K] extends (i: any) => infer R ? R : never;
} & {};

// Magic type that when used at sites where generic types are inferred from, will prevent those sites from being involved in the inference.
// https://github.com/microsoft/TypeScript/issues/14829
export type NoInfer<T> = [T][T extends any ? 0 : never];
