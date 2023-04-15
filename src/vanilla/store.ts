import type { Scheduler } from './effect';
import { SideEffectsManager } from './effect';

import type { BareSlice } from './slice';
import { sliceDepLineageLookup, StoreState } from './state';
import {
  DebugFunc,
  Transaction,
  txLog,
  TX_META_DISPATCH_INFO,
} from './transaction';
import { TX_META_DISPATCHER, TX_META_STORE_NAME } from './transaction';
import { BareStore } from './public-types';
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
        console.debug(
          'No state change, skipping update to',
          tx.targetSliceLineage,
        );

        return;
      }
      Store.updateState(store, newState, tx);
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
    // See StoreState.create for more info.
    initStateOverride?: Record<string, unknown>;
  }): BareStore<SB> {
    if (!(state instanceof StoreState)) {
      if (Array.isArray(state)) {
        let slices: BareSlice[] = expandSlices(state);

        state = StoreState.create(slices, initStateOverride);
      }
    }

    const store = new Store(
      state,
      storeName,
      dispatchTx,
      scheduler,
      disableSideEffects,
      debug,
    );

    return store;
  }

  /**
   * Create a new store that only has access to the given slices
   * @param slices
   * @returns
   */
  static getReducedStore<SB extends BareSlice>(
    store: BareStore<any>,
    dispatcherSlice?: BareSlice,
  ): ReducedStore<SB> {
    return new ReducedStore(store, dispatcherSlice);
  }

  static updateState(
    store: Store,
    newState: StoreState,
    tx?: Transaction<any, any>,
  ) {
    if (store._destroyed) {
      return;
    }

    if (store._debug && tx) {
      store._debug(txLog(tx));
    }

    store.state = newState;

    if (tx) {
      store._effectsManager?.queueSideEffectExecution(store, {
        lineageId: tx.targetSliceLineage,
        actionId: tx.actionId,
      });
    }
  }

  dispatch = (tx: Transaction<string, any>, dispatchInfo?: string) => {
    if (this._destroyed) {
      return;
    }
    if (!this.state.slicesLookup[tx.targetSliceLineage]) {
      throw new Error(
        `Cannot dispatch transaction as slice "${tx.targetSliceLineage}" is not registered in Store`,
      );
    }
    if (!this.state.slicesLookup[tx.sourceSliceLineage]) {
      throw new Error(
        `Cannot dispatch transaction as slice "${tx.sourceSliceLineage}" is not registered in Store`,
      );
    }

    // TODO add a check to make sure tx is actually allowed
    // based on the slice dependencies
    tx.metadata.setMetadata(TX_META_STORE_NAME, this.storeName);

    if (dispatchInfo) {
      tx.metadata.appendMetadata(TX_META_DISPATCH_INFO, dispatchInfo);
    }

    this._dispatchTx(this, tx);
  };

  private _abortController = new AbortController();
  private _destroyed = false;

  protected _effectsManager: SideEffectsManager | undefined;

  constructor(
    public state: StoreState,
    public storeName: string,
    private _dispatchTx: DispatchTx<any>,
    scheduler?: Scheduler,
    disableSideEffects?: boolean,
    private _debug?: DebugFunc,
  ) {
    if (!disableSideEffects) {
      this._effectsManager = new SideEffectsManager(
        StoreState.getSlices(state),
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

  // TODO: this will be removed once we have better way of adding dynamic slices
  _tempRegisterOnSyncChange(sl: BareSlice, cb: () => void) {
    return (
      this._effectsManager?._tempRegisterOnSyncChange(sl.lineageId, cb) ||
      (() => {})
    );
  }
}

export class ReducedStore<SB extends BareSlice> {
  dispatch = (tx: Transaction<SB['name'], any>, debugDispatch?: string) => {
    if (this.dispatcherSlice) {
      if (
        tx.sourceSliceLineage !== this.dispatcherSlice.lineageId &&
        !sliceDepLineageLookup(this.dispatcherSlice).has(tx.sourceSliceLineage)
      ) {
        const sourceSlice = this.storeState.slicesLookup[tx.sourceSliceLineage];
        throw new Error(
          `Dispatch not allowed! Slice "${this.dispatcherSlice.name}" does not include "${sourceSlice?.name}" in its dependency.`,
        );
      }

      tx.metadata.appendMetadata(
        TX_META_DISPATCHER,
        this.dispatcherSlice.lineageId,
      );
    }

    if (debugDispatch) {
      tx.metadata.appendMetadata(TX_META_DISPATCH_INFO, debugDispatch);
    }
    // TODO add a developer check to make sure tx slice is actually allowed
    this._store.dispatch(tx);
  };

  constructor(
    private _store: Store | BareStore<any>,
    private dispatcherSlice?: BareSlice,
  ) {}

  get destroyed() {
    return this._store.destroyed;
  }

  private get storeState(): StoreState {
    return this._store.state;
  }

  get state(): StoreState<SB> {
    if (this.dispatcherSlice) {
      return StoreState.scoped(this.storeState, this.dispatcherSlice.lineageId);
    }

    return this.storeState;
  }

  destroy() {
    this._store.destroy();
  }
}
