import { BaseStore } from '../base-store';
import { Store } from '../store';
import type { Transaction } from '../transaction';
import { EffectCleanupCallback } from './types';

export type OperationOpts = {
  maxWait?: number;
};

export class Operation {}

export class OperationStore extends BaseStore {
  private cleanupRan = false;
  private readonly _cleanupCallbacks: Set<EffectCleanupCallback> = new Set();

  _rootStore: Store<any>;

  get config(): Record<string, any> {
    return this._rootStore.config;
  }

  constructor(
    private rootStore: Store<any>,
    public readonly name: string,
    private readonly opts: OperationOpts,
  ) {
    super();
    this._rootStore = rootStore;
  }

  get state() {
    return this.rootStore.state;
  }

  dispatch(txn: Transaction<any, any> | Operation) {
    this.rootStore.dispatch(txn);
  }

  _addCleanup(cb: EffectCleanupCallback): void {
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
