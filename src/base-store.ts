import { Transaction } from './transaction';
import type { StoreKey } from './types';

export type BaseStoreOpts = {
  state: object;
};

export type BaseStoreConfig = {
  readonly rootStoreKey: StoreKey;
};

export type InferSliceNameFromStore<T> = T extends BaseStore<infer TSliceName>
  ? TSliceName
  : never;

export type Dispatch = (
  txn: Transaction<any>,
  opts?: {
    debugInfo?: string;
  },
) => void;

export abstract class BaseStore<TSliceName extends string> {
  abstract readonly dispatch: Dispatch;
  abstract readonly state: unknown;
}
