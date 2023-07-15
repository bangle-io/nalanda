export type { Dispatch } from './base-store';
export { cleanup } from './cleanup';
export type { EffectStore } from './effect';
export type { Effect } from './effect';
export type { EffectCreator } from './effect';
export { effect } from './effect';
export { shallowEqual } from './helpers';
export type { Operation } from './operation';
export type { OperationStore } from './operation';
export { operation } from './operation';
export { ref } from './ref';
export type { Slice } from './slice';
export { slice } from './slice';
export { sliceKey } from './slice';
export type { SliceKey } from './slice/slice-key';
export type { Store } from './store';
export {
  DEFAULT_DISPATCH_OPERATION,
  DEFAULT_DISPATCH_TRANSACTION,
} from './store';
export { store } from './store';
export type { StoreState } from './store-state';
export type { Transaction } from './transaction';
export type { AnySlice, InferSliceNameFromSlice, SliceId } from './types';

// type InferSliceName<T> = T extends Slice<infer N, any, any> ? N : never;
