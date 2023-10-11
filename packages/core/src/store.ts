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
import { genStoreId } from './helpers/id-generation';
import { onAbortOnce } from './effect/on-abort';
import { calcReverseDependencies } from './helpers/dependency-helpers';

export interface StoreOptions<TSliceName extends string> {
  name?: string;
  slices: Slice<any, TSliceName, any>[];
  debug?: DebugLogger;
  autoStartEffects?: boolean | undefined;
  overrides?: {
    stateOverride?: Record<SliceId, Record<string, unknown>>;
    /**
     * Overrides all effects schedulers for all effects in the store.
     */
    effectScheduler?: EffectScheduler;
    dispatchTransaction?: DispatchTransaction<TSliceName>;
  };
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
  return new Store<TSliceName>(config);
}

type StoreComputed = {
  readonly allSlices: ReadonlySet<Slice>;
  /**
   * A map of sliceId to all slices that depend on it.
   */
  readonly reverseAllDependencies: Record<SliceId, ReadonlySet<Slice>>;
  readonly slicesLookup: Record<SliceId, Slice>;
};

function getStoreComputed(options: StoreOptions<any>): StoreComputed {
  const allSlices = new Set<Slice>(options.slices);

  const slicesLookup = Object.fromEntries(
    options.slices.map((slice) => [slice.sliceId, slice]),
  );

  const reverseAllDependencies = Object.fromEntries(
    Object.entries(calcReverseDependencies(options.slices)).map(
      ([sliceId, sliceIds]) => {
        return [sliceId, new Set([...sliceIds].map((id) => slicesLookup[id]!))];
      },
    ),
  );

  return {
    allSlices,
    reverseAllDependencies,
    slicesLookup,
  };
}

export class Store<TSliceName extends string = any> extends BaseStore {
  public readonly initialState: StoreState<TSliceName>;
  public readonly uid: string;

  // @internal
  private _state: StoreState<TSliceName>;
  // @internal
  _rootStore: Store<TSliceName>;
  // @internal
  _effectsManager: EffectManager;
  // @internal
  private _dispatchTxn: DispatchTransaction<TSliceName>;

  private destroyController = new AbortController();

  public get destroySignal() {
    return this.destroyController.signal;
  }

  readonly _computed: StoreComputed;

  get state() {
    return this._state;
  }

  destroy() {
    this.destroyController.abort();
  }

  constructor(public readonly options: StoreOptions<TSliceName>) {
    super();
    this.uid = genStoreId.generate(options.name || 'unnamed-store');

    this._state = StoreState.create({
      slices: options.slices,
    });

    this.initialState = this._state;

    this._dispatchTxn =
      options.overrides?.dispatchTransaction || DEFAULT_DISPATCH_TRANSACTION;

    this._rootStore = this;

    // Keep effectsManager at the end - as it access `this` and we want to make sure
    // everything is initialized before we call it.
    this._effectsManager = new EffectManager(this.options.slices, {
      debug: this.options.debug,
    });
    onAbortOnce(this.destroyController.signal, () => {
      this._effectsManager.destroy();
    });

    this.options.slices.forEach((slice) => {
      // register the known effects
      slice._key._effectCreators.forEach((creatorObject) => {
        this._effectsManager.registerEffect(this, creatorObject);
      });

      // if a new effect is added, register it
      const cleanup = slice._key._keyEvents.subscribe((event) => {
        if (event.type === 'new-effect') {
          this._effectsManager.registerEffect(this, event.payload);
        }
      });
      onAbortOnce(this.destroyController.signal, cleanup);
    });

    this._computed = getStoreComputed(this.options);

    if (this.options.autoStartEffects) {
      // this is important to make sure that the store is fully
      //  initialized before we start the effects
      queueMicrotask(() => {
        this.startEffects();
      });
    }
  }

  dispatch(transaction: Transaction<any, any> | Operation): void {
    if (this.destroySignal.aborted) {
      return;
    }

    if (transaction instanceof Transaction) {
      this._dispatchTxn(this, this.updateState, transaction);
    }
    // TODO - dispatch operation
  }

  effect(
    callback: EffectCallback<TSliceName>,
    options: Partial<EffectOpts> = {},
  ) {
    return this._effectsManager.registerEffect(this, { callback, options });
  }

  unregisterEffect(effect: Effect): void {
    this._effectsManager.unregisterEffect(effect);
  }

  /**
   * Starts the effects of the store. This is only useful if you have disabled the autoStartEffects option.
   */
  startEffects() {
    this._effectsManager.unpauseEffects(this._state);
  }

  pauseEffects() {
    this._effectsManager.pauseEffects();
  }

  // @internal
  private updateState = (newState: StoreState<TSliceName>) => {
    const oldState = this._state;
    this._state = newState;
    this._effectsManager.queueRunEffects(newState, oldState);
  };
}
