import type { Scheduler } from './effect';
import { SideEffectsManager } from './effect';

import type { BareSlice } from './slice';
import { InternalStoreState, sliceDepLineageLookup, StoreState } from './state';
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

  dispatch = (tx: Transaction<string, any>, dispatchInfo?: string) => {
    if (this._destroyed) {
      return;
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
    dispatcherSlice?: BareSlice,
  ): ReducedStore<SB> {
    return new ReducedStore(this, dispatcherSlice);
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
        lineageId: tx.targetSliceLineage,
        actionId: tx.actionId,
      });
    }
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
        const sourceSlice =
          this.internalStoreState.slicesLookupByLineage[tx.sourceSliceLineage];
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

  private get internalStoreState(): InternalStoreState {
    return this._store.state as InternalStoreState;
  }

  get state(): StoreState<SB> {
    if (this.dispatcherSlice) {
      return this.internalStoreState.scoped(this.dispatcherSlice.lineageId);
    }

    return this.internalStoreState;
  }

  destroy() {
    this._store.destroy();
  }
}
