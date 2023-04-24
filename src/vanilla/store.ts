import { Scheduler, SideEffectsManager } from './effect';
import type { AnySlice, AnySliceWithName, UnknownSlice } from './slice';
import { sliceDepLineageLookup, StoreState } from './state';
import {
  DebugFunc,
  Transaction,
  txLog,
  TX_META_DISPATCHER,
  TX_META_DISPATCH_INFO,
  TX_META_STORE_NAME,
} from './transaction';

export type DispatchTx<TX extends Transaction<any, any>> = (
  store: Store,
  tx: TX,
) => void;

export class Store<N extends string = any> {
  static create<N extends string>({
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
    state: StoreState<N> | AnySliceWithName<N>[];
    storeName: string;
    debug?: DebugFunc | undefined;
    // A record of slice name and the override state for that slice.
    // See StoreState.create for more info.
    initStateOverride?: Record<string, unknown>;
  }): Store<N> {
    if (!(state instanceof StoreState)) {
      if (Array.isArray(state)) {
        state = StoreState.create(state, initStateOverride);
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
  static getReducedStore<N extends string>(
    store: Store,
    dispatcherSlice: AnySliceWithName<N>,
  ): ReducedStore<N> {
    return new ReducedStore(store, dispatcherSlice);
  }

  static updateState(
    store: Store,
    newState: StoreState<any>,
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

  dispatch = <TName extends string = any>(
    tx: Transaction<TName extends N ? TName : never, any>,
    dispatchInfo?: string,
  ) => {
    if (this._destroyed) {
      return;
    }
    if (!StoreState.getSlice(this.state, tx.targetSliceLineage)) {
      throw new Error(
        `Cannot dispatch transaction as slice "${tx.targetSliceLineage}" is not registered in Store`,
      );
    }
    if (!StoreState.getSlice(this.state, tx.sourceSliceLineage)) {
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
    public state: StoreState<N>,
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

  get destroyed() {
    return this._destroyed;
  }
  get destroySignal() {
    return this._abortController.signal;
  }

  destroy() {
    this._destroyed = true;
    this._effectsManager?.destroy(this.state);
    this._effectsManager = undefined;
    this._abortController.abort();
  }

  // TODO: this will be removed once we have better way of adding dynamic slices
  _tempRegisterOnSyncChange(sl: UnknownSlice, cb: () => void) {
    return (
      this._effectsManager?._tempRegisterOnSyncChange(sl.spec.lineageId, cb) ||
      (() => {})
    );
  }
}

export class ReducedStore<N extends string = any> {
  dispatch = (tx: Transaction<N, any>, debugDispatch?: string) => {
    if (this.dispatcherSlice) {
      if (
        tx.sourceSliceLineage !== this.dispatcherSlice.spec.lineageId &&
        !sliceDepLineageLookup(this.dispatcherSlice).has(tx.sourceSliceLineage)
      ) {
        const sourceSlice = StoreState.getSlice(
          this._storeState,
          tx.sourceSliceLineage,
        );
        throw new Error(
          `Dispatch not allowed! Slice "${this.dispatcherSlice.spec.name}" does not include "${sourceSlice?.spec.name}" in its dependency.`,
        );
      }

      tx.metadata.appendMetadata(
        TX_META_DISPATCHER,
        this.dispatcherSlice.spec.lineageId,
      );
    }

    if (debugDispatch) {
      tx.metadata.appendMetadata(TX_META_DISPATCH_INFO, debugDispatch);
    }
    // TODO add a developer check to make sure tx slice is actually allowed
    this._store.dispatch(tx);
  };

  constructor(
    private _store: Store,
    private dispatcherSlice: AnySliceWithName<N>,
  ) {}

  get destroyed() {
    return this._store.destroyed;
  }

  get state(): StoreState<N> {
    if (this.dispatcherSlice) {
      return StoreState.scoped(
        this._storeState,
        this.dispatcherSlice.spec.lineageId,
      );
    }

    return this._storeState;
  }

  destroy() {
    this._store.destroy();
  }

  private get _storeState(): StoreState<any> {
    return this._store.state;
  }
}
