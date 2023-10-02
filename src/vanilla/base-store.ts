import type { Operation } from './effect/operation';
import type { StoreState } from './store-state';
import type { Transaction } from './transaction';

export type Dispatch = (
  txn: Transaction | Operation,
  opts?: {
    debugInfo?: string;
  },
) => void;

export abstract class BaseStore {
  abstract readonly state: StoreState;

  abstract dispatch(txn: Transaction | Operation): void;
}
