import { BaseStore } from './base-store';
import {
  effect,
  type EffectCallback,
  type EffectOpts,
  type EffectScheduler,
} from './effect/effect';
import type { DebugLogger } from './logger';
import type { Operation } from './effect/operation';
import type { Slice } from './slice';
import { StoreState } from './store-state';
import { Transaction } from './transaction';
import type { SliceId } from './types';
import { EffectManager } from './effect/effect-manager';

interface StoreOptions {
  name?: string;
  slices: Slice[];
  debug?: DebugLogger;
  overrides?: {
    stateOverride?: Record<SliceId, Record<string, unknown>>;
    /**
     * Overrides all effects schedulers for all effects in the store.
     */
    effectSchedulerOverride?: EffectScheduler;
    dispatchTransactionOverride?: DispatchTransaction;
  };
  manualEffectsTrigger?: boolean;
}

export const DEFAULT_DISPATCH_TRANSACTION: DispatchTransaction = (
  store,
  updateState,
  tx,
) => {
  const newState = store.state.apply(tx);
  updateState(newState);
};

// type DispatchOperation = (store: Store, operation: Operation) => void;

type DispatchTransaction = (
  store: Store,
  updateState: (state: StoreState) => void,
  tx: Transaction,
) => void;

export function createStore(config: StoreOptions) {
  return new Store({ ...config, name: 'anonymous' });
}

export class Store extends BaseStore {
  private _state: StoreState;
  public readonly initialState: StoreState;

  private effectsManager: EffectManager;
  private destroyed = false;
  private registeredSlicesEffect = false;
  private _dispatchTxn: DispatchTransaction;

  get state() {
    return this._state;
  }

  destroy() {
    if (this.destroyed) {
      return;
    }

    this.destroyed = true;
    this.effectsManager.destroy();
  }

  isDestroyed() {
    return this.destroyed;
  }

  constructor(public readonly options: StoreOptions) {
    super();
    this._state = StoreState.create({
      slices: options.slices,
    });
    this.initialState = this._state;

    this._dispatchTxn =
      options.overrides?.dispatchTransactionOverride ||
      DEFAULT_DISPATCH_TRANSACTION;

    this.effectsManager = new EffectManager(this.options.slices, {
      debug: this.options.debug,
    });

    // do it a bit later so that all effects are registered
    queueMicrotask(() => {
      this.options.slices.forEach((slice) => {
        slice._key._effectCallbacks.forEach(([effectCallback, opts]) => {
          this.effect(effectCallback, opts);
        });
      });
      this.registeredSlicesEffect = true;
    });
  }

  dispatch(transaction: Transaction | Operation): void {
    if (this.destroyed) {
      return;
    }

    if (transaction instanceof Transaction) {
      this._dispatchTxn(this, this.updateState, transaction);
    }
    // TODO - dispatch operation
  }

  effect(callback: EffectCallback, opts: Partial<EffectOpts> = {}) {
    const effectInstance = effect(callback, opts)(this);
    this.effectsManager.registerEffect(effectInstance);

    return effectInstance;
  }

  runEffects() {
    queueMicrotask(() => {
      this.effectsManager.run();
    });
  }

  private updateState = (newState: StoreState) => {
    const oldState = this._state;
    this._state = newState;

    if (!this.options.manualEffectsTrigger) {
      queueMicrotask(() => {
        this.effectsManager.run(this._state._getChangedSlices(oldState));
      });
    }
  };
}
