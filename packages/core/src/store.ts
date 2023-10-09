import { BaseStore } from './base-store';
import {
  Effect,
  effect,
  type EffectCallback,
  type EffectOpts,
  type EffectScheduler,
} from './effect/effect';
import { EffectManager } from './effect/effect-manager';
import { StoreState } from './store-state';
import type { DebugLogger } from './logger';
import type { Operation } from './effect/operation';
import type { Slice } from './slice/slice';
import type { SliceId } from './types';
import { Transaction } from './transaction';

export interface StoreOptions<TSliceName extends string> {
  name?: string;
  slices: Slice<any, TSliceName, any>[];
  debug?: DebugLogger;
  overrides?: {
    stateOverride?: Record<SliceId, Record<string, unknown>>;
    /**
     * Overrides all effects schedulers for all effects in the store.
     */
    effectScheduler?: EffectScheduler;
    dispatchTransaction?: DispatchTransaction<TSliceName>;
  };
  manualEffectsTrigger?: boolean;
}

export const DEFAULT_DISPATCH_TRANSACTION: DispatchTransaction<any> = (
  store,
  updateState,
  tx,
) => {
  const newState = store.state.apply(tx);
  updateState(newState);
};

type DispatchTransaction<TSliceName extends string> = (
  store: Store<TSliceName>,
  updateState: (state: StoreState<TSliceName>) => void,
  tx: Transaction<any, any>,
) => void;

export function createStore<TSliceName extends string>(
  config: StoreOptions<TSliceName>,
): Store<TSliceName> {
  return new Store<TSliceName>({ ...config, name: 'anonymous' });
}

export class Store<TSliceName extends string = any> extends BaseStore {
  public readonly initialState: StoreState<TSliceName>;

  // @internal
  private _state: StoreState<TSliceName>;

  // @internal
  _rootStore: Store<TSliceName>;
  // @internal
  private effectsManager: EffectManager;
  // @internal
  private destroyed = false;
  // @internal
  private registeredSlicesEffect = false;
  // @internal
  private _dispatchTxn: DispatchTransaction<TSliceName>;

  private destroyController = new AbortController();

  public get destroySignal() {
    return this.destroyController.signal;
  }

  get state() {
    return this._state;
  }

  destroy() {
    if (this.destroyed) {
      return;
    }

    this.destroyed = true;
    this.destroyController.abort();
    this.effectsManager.destroy();
  }

  isDestroyed() {
    return this.destroyed;
  }

  constructor(public readonly options: StoreOptions<TSliceName>) {
    super();

    this._state = StoreState.create({
      slices: options.slices,
    });
    this.initialState = this._state;

    this._dispatchTxn =
      options.overrides?.dispatchTransaction || DEFAULT_DISPATCH_TRANSACTION;

    this.effectsManager = new EffectManager(this.options.slices, {
      debug: this.options.debug,
    });

    this._rootStore = this;

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

  dispatch(transaction: Transaction<any, any> | Operation): void {
    if (this.destroyed) {
      return;
    }

    if (transaction instanceof Transaction) {
      this._dispatchTxn(this, this.updateState, transaction);
    }
    // TODO - dispatch operation
  }

  effect(callback: EffectCallback<TSliceName>, opts: Partial<EffectOpts> = {}) {
    const effectInstance = effect(callback, opts)(this);
    this.effectsManager.registerEffect(effectInstance);

    return effectInstance;
  }

  unregisterEffect(effect: Effect): void {
    this.effectsManager.unregisterEffect(effect);
  }

  runEffects() {
    queueMicrotask(() => {
      this.effectsManager.run();
    });
  }

  // @internal
  private updateState = (newState: StoreState<TSliceName>) => {
    const oldState = this._state;
    this._state = newState;

    if (!this.options.manualEffectsTrigger) {
      queueMicrotask(() => {
        this.effectsManager.run(this._state._getChangedSlices(oldState));
      });
    }
  };
}
