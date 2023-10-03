import { BaseStore } from '../base-store';
import type { CleanupCallback } from './cleanup';
import { Store } from '../store';
import type { Transaction } from '../transaction';

export type OperationOpts = {
  name?: string;
};

type OperationCallback = (store: OperationStore) => Promise<void>;

export class Operation {
  private callbacks: OperationCallback[] = [];
  executed = false;

  constructor(private opts: OperationOpts = {}) {}

  exec(callback: (store: OperationStore) => void | Promise<void>): Operation {
    this.callbacks.push(async (store) => callback(store));
    return this;
  }

  async _run(store: Store): Promise<void> {
    if (this.executed) {
      return;
    }
    const operationStore = new OperationStore(
      store,
      this.opts?.name || 'operation',
      this.opts,
    );
    this.executed = true;
    const callbacks = this.callbacks;
    this.callbacks = [];
    for (const callback of callbacks) {
      await callback(operationStore);
    }
  }
}

export class OperationStore extends BaseStore {
  private cleanupRan = false;
  private readonly _cleanupCallbacks: Set<CleanupCallback> = new Set();

  constructor(
    private rootStore: Store,
    public readonly name: string,
    private readonly opts: OperationOpts,
  ) {
    super();
  }

  get state() {
    return this.rootStore.state;
  }

  dispatch(txn: Transaction | Operation) {
    this.rootStore.dispatch(txn);
  }

  _addCleanup(cb: CleanupCallback): void {
    if (this.cleanupRan) {
      console.warn(
        `Adding a new cleanup to ${this.name} as cleanups have already run`,
      );
      void cb();

      return;
    }

    this._cleanupCallbacks.add(cb);
  }

  _runCleanup(): void {
    if (this.cleanupRan) {
      return;
    }

    for (const cleanup of this._cleanupCallbacks) {
      try {
        void cleanup();
      } catch (e) {
        console.error(e);
      }
    }
    this.cleanupRan = true;
  }
}
