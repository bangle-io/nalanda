import type { Operation } from './effect/operation';
import type { Store } from './store';
import type { StoreState } from './store-state';
import type { Transaction } from './transaction';

export type Dispatch = (
  txn: Transaction | Operation,
  opts?: {
    debugInfo?: string;
  },
) => void;

export abstract class BaseStore {
  abstract readonly state: StoreState<any>;

  // @internal
  abstract _rootStore: Store<any>;

  abstract dispatch(txn: Transaction | Operation): void;
}
