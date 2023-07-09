import { BaseStore, Dispatch } from './base-store';
import { Slice } from './slice';
import { StoreState, StoreStateOpts } from './store-state';
import { TX_META_STORE_NAME, Transaction } from './transaction';
import { EffectManager, effect } from './effect';
import type { Effect, EffectCallback, EffectOpts } from './effect';
import { calcReverseDependencies } from './helpers';
import { SliceId } from './types';

type StoreOpts<TSliceName extends string = any> = {
  slices: Slice<TSliceName, any, any>[];
  stateOverride?: NonNullable<StoreStateOpts<TSliceName>['stateOverride']>;
  dispatchTxn?: DispatchTx;
  storeName: string;
};

type DispatchTx = (
  store: Store,
  updateState: (state: StoreState<any>) => void,
  tx: Transaction<any>,
) => void;

type InternalStoreConfig<TSliceName extends string = any> = {
  slicesLookup: Record<SliceId, Slice<TSliceName, any, any>>;
  reverseSliceDependencies: Record<SliceId, Set<SliceId>>;
};

export class Store<TSliceName extends string = any>
  implements BaseStore<TSliceName>
{
  private _destroyed = false;

  private _effectsManager: EffectManager;

  private _dispatchTxn: DispatchTx;

  private _state: StoreState<TSliceName>;

  static create<TSliceName extends string>(opts: StoreOpts<TSliceName>) {
    const slicesLookup = Object.fromEntries(
      opts.slices.map((slice) => [slice.sliceId, slice]),
    );

    const config: InternalStoreConfig<TSliceName> = {
      slicesLookup,
      reverseSliceDependencies: calcReverseDependencies(opts.slices),
    };

    return new Store(opts, config);
  }

  get state(): StoreState<TSliceName> {
    return this._state;
  }

  private constructor(
    public readonly opts: StoreOpts<TSliceName>,
    protected readonly config: InternalStoreConfig<TSliceName>,
  ) {
    this._state = StoreState.create(opts);
    this._dispatchTxn =
      opts.dispatchTxn ||
      ((_, __, tx) => {
        const newState = this.state.applyTransaction(tx);
        this.updateState(newState);
      });

    this._effectsManager = new EffectManager(this.opts.slices);
  }

  private updateState = (state: StoreState<any>) => {
    const oldState = this._state;
    this._state = state;
    this._effectsManager.run(this._state._getChangedSlices(oldState));
  };

  readonly dispatch: Dispatch = (txn, opts) => {
    if (this._destroyed) {
      return;
    }

    txn.metadata.setMetadata(TX_META_STORE_NAME, this.opts.storeName);
    this._dispatchTxn(this, this.updateState, txn);
  };

  destroy() {
    this._destroyed = true;

    this._effectsManager.destroy();
  }

  effect(
    callback: EffectCallback<Store<TSliceName>>,
    opts: EffectOpts = {},
  ): Effect {
    const ef = effect(callback, opts)(this);
    this._effectsManager.registerEffect(ef);

    return ef;
  }

  get destroyed() {
    return this._destroyed;
  }
}
