import type { Scheduler } from './effect';
import { SideEffectsManager } from './effect';

import type { BareSlice } from './slice';
import { InternalStoreState, StoreState } from './state';
import { DebugFunc, Transaction, txLog } from './transaction';
import { TX_META_DISPATCH_SOURCE, TX_META_STORE_NAME } from './transaction';
import { BareStore } from './public-types';
import { SliceContext } from './internal-types';
import { expandSlices } from './slices-helpers';

export type DispatchTx<TX extends Transaction<any, any>> = (
  store: Store,
  tx: TX,
) => void;

export class Store implements BareStore<any> {
  static create<SB extends BareSlice>({
    disableSideEffects = false,
    dispatchTx = (store, tx) => {
      let newState = store.state.applyTransaction(tx);

      if (newState === store.state) {
        console.debug('No state change, skipping update', tx.targetSliceKey);

        return;
      }

      store.updateState(newState, tx);
    },
    scheduler,
    state,
    storeName,
    debug,
    initStateOverride,
  }: {
    disableSideEffects?: boolean;
    dispatchTx?: DispatchTx<Transaction<any, any>>;
    scheduler?: Scheduler;
    state: StoreState<SB> | SB[];
    storeName: string;
    debug?: DebugFunc | undefined;
    // A record of slice name and the override state for that slice.
    // See InternalStoreState.create for more info.
    initStateOverride?: Record<string, unknown>;
  }): BareStore<SB> {
    if (!(state instanceof InternalStoreState)) {
      if (Array.isArray(state)) {
        let slices: BareSlice[] = expandSlices(state);

        state = InternalStoreState.create(slices, initStateOverride);
      }
    }

    const store = new Store(
      state as InternalStoreState,
      storeName,
      dispatchTx,
      scheduler,
      disableSideEffects,
      debug,
    );

    return store;
  }

  dispatch = (tx: Transaction<string, any>, debugDispatch?: string) => {
    if (this._destroyed) {
      return;
    }
    // TODO add a check to make sure tx is actually allowed
    // based on the slice dependencies
    tx.metadata.setMetadata(TX_META_STORE_NAME, this.storeName);

    if (debugDispatch) {
      tx.metadata.appendMetadata(TX_META_DISPATCH_SOURCE, debugDispatch);
    }

    this._dispatchTx(this, tx);
  };

  private _abortController = new AbortController();
  private _destroyed = false;

  private _effectsManager: SideEffectsManager | undefined;

  constructor(
    public state: InternalStoreState,
    public storeName: string,
    private _dispatchTx: DispatchTx<any>,
    scheduler?: Scheduler,
    disableSideEffects?: boolean,
    private _debug?: DebugFunc,
  ) {
    if (!disableSideEffects) {
      this._effectsManager = new SideEffectsManager(
        state._slices,
        state,
        scheduler,
        this._debug,
      );
      queueMicrotask(() => {
        this._effectsManager?.initEffects(this);
      });
    }

    this._abortController.signal.addEventListener(
      'abort',
      () => {
        this.destroy();
      },
      {
        once: true,
      },
    );
  }

  get destroySignal() {
    return this._abortController.signal;
  }

  get destroyed() {
    return this._destroyed;
  }

  destroy() {
    this._destroyed = true;
    this._effectsManager?.destroy(this.state);
    this._effectsManager = undefined;
    this._abortController.abort();
  }

  /**
   * Create a new store that only has access to the given slices
   * @param slices
   * @returns
   */
  getReducedStore<SB extends BareSlice>(
    debugDispatch?: string,
    sliceContext?: SliceContext,
  ): ReducedStore<SB> {
    return new ReducedStore(this, debugDispatch, sliceContext);
  }

  updateState(newState: InternalStoreState, tx?: Transaction<any, any>) {
    if (this._destroyed) {
      return;
    }

    if (this._debug && tx) {
      this._debug(txLog(tx));
    }

    this.state = newState;

    if (tx) {
      this._effectsManager?.queueSideEffectExecution(this, {
        sliceKey: tx.targetSliceKey,
        actionId: tx.actionId,
      });
    }
  }

  // TODO: this will be removed once we have better way of adding dynamic slices
  _tempRegisterOnSyncChange(sl: BareSlice, cb: () => void) {
    return (
      this._effectsManager?._tempRegisterOnSyncChange(sl.key, cb) || (() => {})
    );
  }
}

export class ReducedStore<SB extends BareSlice> {
  dispatch = (tx: Transaction<SB['name'], any>, debugDispatch?: string) => {
    if (this._debugDispatchSrc) {
      tx.metadata.appendMetadata(
        TX_META_DISPATCH_SOURCE,
        this._debugDispatchSrc,
      );
    }

    const sliceContext = this._sliceContext;

    if (sliceContext) {
      const matchingSlice =
        this.internalStoreState.sliceLookupByKey[sliceContext.sliceKey];

      if (matchingSlice) {
        const newTargetSliceKey = matchingSlice?.keyMap.resolve(
          tx.targetSliceName,
        );
        if (newTargetSliceKey) {
          tx = tx.changeTargetSlice(newTargetSliceKey);
        }
        // TODO: we also have a source slice key field and that will currently be wrong
        // and will need resolution similar to target slice key
        // this is because source is set when calling something slice1.actions.foo()
        // this will set source key from slice1, which might not be the correct source.
      }
    }

    if (debugDispatch) {
      tx.metadata.appendMetadata(TX_META_DISPATCH_SOURCE, debugDispatch);
    }
    // TODO add a developer check to make sure tx slice is actually allowed
    this._store.dispatch(tx);
  };

  constructor(
    private _store: Store | BareStore<any>,
    public _debugDispatchSrc?: string,
    public readonly _sliceContext?: SliceContext,
  ) {}

  get destroyed() {
    return this._store.destroyed;
  }

  private get internalStoreState(): InternalStoreState {
    return this._store.state as InternalStoreState;
  }

  get state(): StoreState<SB> {
    return this.internalStoreState._withContext(this._sliceContext);
  }

  destroy() {
    this._store.destroy();
  }
}
