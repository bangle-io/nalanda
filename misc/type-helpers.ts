import { Slice } from '@nalanda/core';

export type IfEquals<T, U, Y = unknown, N = never> = (<G>() => G extends T
  ? 1
  : 2) extends <G>() => G extends U ? 1 : 2
  ? Y
  : N;

export const expectType = <Expected, Actual>(
  _actual: IfEquals<Actual, Expected, Actual>,
) => void 0;

export type InferSliceName<T> = T extends Slice<any, infer Name, any>
  ? Name
  : never;

export type InferSliceDepNames<T> = T extends Slice<any, any, infer DepNames>
  ? DepNames
  : never;
