import { DebugLogger } from './logger';
import { Operation } from './operation';
import type { Slice } from './slice';
import { StoreState } from './store-state';
import { Transaction } from './transaction';
import { SliceId } from './types';

interface StoreOptions {
  name: string;
  slices: Slice[];
  debug?: DebugLogger;
  stateOverride?: Record<SliceId, Record<string, unknown>>;
}

type DispatchOperation = (store: Store, operation: Operation) => void;

type DispatchTransaction = (
  store: Store,
  updateState: (state: StoreState) => void,
  tx: Transaction,
) => void;

export function createStore(config: { name?: string; slices: Slice[] }) {
  return new Store({ ...config, name: 'anonymous' });
}

export class Store {
  state: StoreState;

  constructor(private options: StoreOptions) {
    this.state = StoreState.create({
      slices: options.slices,
    });
  }

  dispatch(transaction: Transaction): void {
    this.state = this.state.apply(transaction);
  }
}
