import { uuid } from './helpers';
import type { Scheduler } from './effect';
import { SideEffectsManager } from './effect';

import type { BareSlice } from './slice';
import { InternalStoreState, StoreState } from './state';
import { DebugFunc, Transaction, txLog } from './transaction';
import {
  TX_META_DISPATCH_SOURCE,
  TX_META_STORE_NAME,
  TX_META_STORE_TX_ID,
} from './transaction';
import { BareStore } from './public-types';

type DispatchTx<TX extends Transaction<any, any>> = (
  store: Store,
  tx: TX,
) => void;

const contextId = uuid(6);

let counter = 0;
function incrementalId() {
  return `${contextId}-${counter++}`;
}

export class Store implements BareStore<any> {
  static create<SB extends BareSlice>({
    disableSideEffects = false,
    dispatchTx = (store, tx) => {
      let newState = store.state.applyTransaction(tx);

      if (newState === store.state) {
        console.debug('No state change, skipping update', tx.sliceKey);

        return;
      }

      store.updateState(newState, tx);
    },
    scheduler,
    state,
    storeName,
    debug,
  }: {
    disableSideEffects?: boolean;
    dispatchTx?: DispatchTx<Transaction<any, any>>;
    scheduler?: Scheduler;
    state: StoreState<SB> | SB[];
    storeName: string;
    debug?: DebugFunc;
  }): BareStore<SB> {
    if (!(state instanceof InternalStoreState)) {
      if (Array.isArray(state)) {
        let slices = state.flatMap((s) => {
          return [...(s._bare.children || []), s];
        });
        state = InternalStoreState.create(slices);
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
    tx.metadata.setMetadata(TX_META_STORE_TX_ID, incrementalId());
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
    slice?: BareSlice,
  ): ReducedStore<SB> {
    return new ReducedStore(this, debugDispatch, slice);
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
        sliceKey: tx.sliceKey,
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
  dispatch = (tx: Transaction<SB['key'], any>, debugDispatch?: string) => {
    if (this._debugDispatchSrc) {
      tx.metadata.appendMetadata(
        TX_META_DISPATCH_SOURCE,
        this._debugDispatchSrc,
      );
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
    public _slice?: BareSlice,
  ) {}

  get destroyed() {
    return this._store.destroyed;
  }

  get state(): StoreState<SB> {
    if (this._slice) {
      return (this._store.state as InternalStoreState)._withKeyMapping(
        this._slice.keyMapping.bind(this._slice),
      );
    }
    // }
    return this._store.state;
  }

  destroy() {
    this._store.destroy();
  }
}
