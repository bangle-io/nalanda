import type { AnySlice, SelectorFn } from './public-types';
import type { BareSlice, Slice } from './slice';
import type { StoreState } from './state';
import type { Transaction } from './transaction';

export type IfAny<T, Y, N> = 0 extends 1 & T ? Y : N;

export type AnyFn = (...args: any[]) => any;

export const expectType = <Type>(_: Type): void => void 0;
export function rejectAny<K extends IfAny<K, never, unknown>>(key: K): void {}

export type TxApplicator<K extends string, SS = any> = (
  sliceState: SS,
  storeState: StoreState<BareSlice>,
  tx: Transaction<K, unknown[]>,
) => SS;

export type ExtractReturnTypes<
  T extends Record<string, (...args: any[]) => any>,
> = {
  [K in keyof T]: T[K] extends (i: any) => infer R ? R : never;
};

// Magic type that when used at sites where generic types are inferred from, will prevent those sites from being involved in the inference.
// https://github.com/microsoft/TypeScript/issues/14829
export type NoInfer<T> = [T][T extends any ? 0 : never];

export type InferSliceActions<SL extends AnySlice> = SL extends Slice<
  any,
  any,
  any,
  infer A,
  any
>
  ? A
  : never;

export type InferSliceSelectors<SL extends AnySlice> = SL extends Slice<
  any,
  any,
  any,
  any,
  infer SE
>
  ? SE
  : never;

export type InferSliceState<SL extends AnySlice> = SL extends Slice<
  any,
  infer SS,
  any,
  any,
  any
>
  ? SS
  : never;

export type SliceStateToSelector<S> = S extends object
  ? {
      [K in keyof S]: SelectorFn<any, any, S[K]>;
    }
  : never;

/**
 * Hack for nominal typing
 * https://basarat.gitbook.io/typescript/main-1/nominaltyping
 */
export declare const __brand: unique symbol;
export type Brand<T, K> = T & { [__brand]: K };

export type SliceKey = string;
export type SliceContext = {
  sliceKey: SliceKey;
};
