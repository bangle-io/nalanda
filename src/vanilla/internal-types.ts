import { BareSlice } from './slice';
import { StoreState } from './state';
import { Transaction } from './transaction';

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
