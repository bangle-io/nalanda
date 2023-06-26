import type { Slice } from './slice';
import { StoreState } from './store-state';

// TODO this will be Store | EffectStore | OpStore
export type TheStoreKey = {};

export class StoreKey {}

export type GetStoreState<TSlice extends Slice<any, any, any>> =
  TSlice extends Slice<infer TSliceName, any, any>
    ? StoreState<TSliceName>
    : never;

/**
 * Hack for nominal typing
 * https://basarat.gitbook.io/typescript/main-1/nominaltyping
 */
declare const __brand: unique symbol;
export type Brand<T, K> = T & { [__brand]: K };

// Magic type that when used at sites where generic types are inferred from, will prevent those sites from being involved in the inference.
// https://github.com/microsoft/TypeScript/issues/14829
export type NoInfer<T> = [T][T extends any ? 0 : never];

export type LineageId = Brand<string, 'LineageId'>;

export type IfEquals<T, U, Y = unknown, N = never> = (<G>() => G extends T
  ? 1
  : 2) extends <G>() => G extends U ? 1 : 2
  ? Y
  : N;

export const expectType = <Expected, Actual>(
  actual: IfEquals<Actual, Expected, Actual>,
) => void 0;

const lineages: Record<string, number> = Object.create(null);

export function createLineageId(name: string): LineageId {
  if (name in lineages) return `l_${name}$${++lineages[name]}` as LineageId;
  lineages[name] = 0;
  return `l_${name}$` as LineageId;
}
