import { BaseStore } from './base-store';
import { EffectsManager } from './effect/effect-manager';
import { StoreState } from './store-state';
import type { DebugLogger } from './logger';
import type { Operation } from './effect/operation';
import type { Slice } from './slice/slice';
import type { SliceId } from './types';
import { Transaction } from './transaction';
import { genStoreId } from './helpers/id-generation';
import { onAbortOnce } from './effect/on-abort';
import { calcReverseDependencies } from './helpers/dependency-helpers';
import type {
  EffectCallback,
  EffectOpts,
  EffectScheduler,
} from './effect/types';
import { createEffectConfig } from './effect/effect';
import { DEFAULT_SCHEDULER } from './defaults';

export interface StoreOptions<TSliceName extends string> {
  name?: string;
  slices: Slice<any, TSliceName, any>[];
  debug?: DebugLogger;
  /**
   * If true, effects will be started automatically when the store is created.
   * Defaults to true.
   */
  autoStartEffects?: boolean | undefined;
  /**
   * config can be used to store any information about the store.
   * This can come handy to pass config information to effects and slices
   */
  config?: Record<string, any>;
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

const defaultOptions: StoreOptions<any> = {
  autoStartEffects: true,
  slices: [],
};

export function createStore<TSliceName extends string>(
  config: StoreOptions<TSliceName>,
): Store<TSliceName> {
  return new Store<TSliceName>({ ...defaultOptions, ...config });
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
  _effectsManager: EffectsManager;
  // @internal
  private _dispatchTxn: DispatchTransaction<TSliceName>;

  private destroyController = new AbortController();

  public get destroySignal() {
    return this.destroyController.signal;
  }
  public readonly config: Record<string, any>;

  // @internal
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
    this.config = options.config || {};

    this._state = StoreState.create({
      slices: options.slices,
    });

    this.initialState = this._state;

    this._dispatchTxn =
      options.overrides?.dispatchTransaction || DEFAULT_DISPATCH_TRANSACTION;

    this._rootStore = this;

    this._effectsManager = new EffectsManager({
      debugger: options.debug,
      scheduler: options.overrides?.effectScheduler || DEFAULT_SCHEDULER,
    });

    onAbortOnce(this.destroyController.signal, () => {
      this._effectsManager.destroy();
    });

    this.options.slices.forEach((slice) => {
      // register the known effects
      slice._key._effects.forEach((creatorObject) => {
        this._effectsManager.add(this, creatorObject);
      });

      // if a new effect is added, register it
      const cleanup = slice._key._keyEvents.subscribe((event) => {
        if (event.type === 'new-effect') {
          this._effectsManager.add(this, event.payload);
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
    const effect = createEffectConfig(callback, options);

    this._effectsManager.add(this, effect);

    return effect.name;
  }

  destroyEffect(effectName: string) {
    this._effectsManager.destroyEffect(effectName);
  }

  /**
   * Starts the effects of the store. This is only useful if you have disabled the autoStartEffects option.
   */
  startEffects() {
    this._effectsManager.start(this);
  }

  pauseEffects() {
    this._effectsManager.stop();
  }

  // @internal
  private updateState = (newState: StoreState<TSliceName>) => {
    const oldState = this._state;
    this._state = newState;
    this._effectsManager.onStateChange({ store: this, oldState });
  };
}
