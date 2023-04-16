import { StableSliceId, Store } from '../vanilla';
import { Scheduler } from '../vanilla/effect';
import { BareSlice } from '../vanilla/slice';
import { DispatchTx } from '../vanilla/store';
import {
  Transaction,
  DebugFunc,
  JSONTransaction,
} from '../vanilla/transaction';
import {
  abortableSetTimeout,
  MainCommunicator,
  SyncMainConfig,
  SyncManager,
  SyncReplicaConfig,
} from './helpers';

// replica sends replica info to main
// then main sends main info to replica
// then replica sends replica ready to main
export type SyncMessage =
  | {
      type: 'replica-info';
      body: ReplicaStoreInfo;
      from: string;
      to: string;
    }
  | {
      type: 'main-info';
      body: MainStoreInfo;
      from: string;
      to: string;
    }
  | {
      type: 'tx';
      from: string;
      to: string;
      body: { tx: JSONTransaction };
    }
  | {
      from: string;
      to: string;
      type: 'replica-ready';
    }
  | {
      from: string;
      to: string;
      type: 'handshake-error';
    };

export interface ReplicaStoreInfo {
  storeName: string;
  mainStoreName: string;
  syncSliceIds: StableSliceId[];
}

export interface MainStoreInfo {
  storeName: string;
  syncSliceIds: StableSliceId[];
  replicaStoreNames: string[];
}

// TODO: move this to store and import from there
interface StoreConfig<SL extends BareSlice> {
  dispatchTx: DispatchTx<Transaction<any, any>>;
  scheduler: Scheduler;
  slices: SL[];
  storeName: string;
  debug?: DebugFunc;
  onSyncError?: (err: Error) => void;
  onSyncReady?: () => void;
}

export function createSyncStore<
  SbSync extends BareSlice,
  SbOther extends BareSlice,
>({
  sync,
  ...config
}: {
  sync: SyncMainConfig<SbSync> | SyncReplicaConfig<SbSync>;
} & StoreConfig<SbOther>) {
  const store =
    sync.type === 'main'
      ? new SyncStoreMain({
          ...config,
          sync,
          dispatchTx: config.dispatchTx || defaultDispatchTx,
        })
      : new SyncStoreReplica({
          ...config,
          sync,
          dispatchTx: config.dispatchTx || defaultDispatchTx,
          scheduler: config.scheduler,
        });

  return store;
}

const defaultDispatchTx: DispatchTx<Transaction<any, any>> = (store, tx) => {
  let newState = store.state.applyTransaction(tx);
  Store.updateState(store, newState, tx);
};

class SyncStoreMain<SbSync extends BareSlice, SbOther extends BareSlice> {
  public readonly store: Store;

  private isReady = false;
  private queuedTx: Transaction<any, any>[] = [];
  private readonly storeName: string;
  private readyReplicas = new Set<string>();
  private replicaSyncError = false;

  private readonly syncManager: SyncManager;
  private comms: MainCommunicator;
  private totalReplicas: number;

  private storeInfo: MainStoreInfo;

  private dispatchTx = (store: Store, tx: Transaction<any, any>) => {
    this.config.dispatchTx(store, tx);

    if (!this.syncManager.isSyncLineageId(tx.targetSliceLineage)) {
      return;
    }

    if (this.replicaSyncError) {
      console.warn(
        `Main store "${this.storeName}" was not able to sync with all replica stores. Transaction "${tx.uid}" was not sent to any replica stores.`,
      );
      return;
    }

    if (!this.isReady) {
      this.queuedTx.push(tx);
    } else {
      // send it to all the replica stores
      this.comms.sendTxn(this.store, tx);
    }
  };

  constructor(
    private config: {
      sync: SyncMainConfig<SbSync>;
    } & StoreConfig<SbOther>,
  ) {
    const { storeName, sync, debug, scheduler } = config;
    this.storeName = storeName;

    this.totalReplicas = this.config.sync.replicaStores.length;
    this.syncManager = new SyncManager({
      storeName,
      otherSlices: config.slices,
      sync: this.config.sync,
    });

    this.storeInfo = {
      storeName,
      syncSliceIds: this.syncManager.syncSliceIds,
      replicaStoreNames: sync.replicaStores,
    };

    this.comms = new MainCommunicator({
      storeName,
      totalReplicas: this.totalReplicas,
      sendMessage: this.config.sync.sendMessage,
      syncManager: this.syncManager,
    });

    // keep this as the last thing ALWAYS to avoid
    this.store = new Store(
      this.syncManager.initStoreState,
      config.storeName,
      this.dispatchTx,
      scheduler,
      false,
      debug,
    );
  }

  public receiveMessage(m: SyncMessage) {
    const type = m.type;
    switch (type) {
      case 'tx': {
        const tx = this.syncManager.parseTxn(this.store, m.body.tx);
        //  This is a transaction coming from one of the replica stores
        this.dispatchTx(this.store, tx);
        break;
      }

      case 'replica-info': {
        const replicaInfo = m.body;
        try {
          validateReplicaInfo(replicaInfo, this.storeInfo);
        } catch (error) {
          this.replicaSyncError = true;

          if (error instanceof Error) {
            this.comms.sendHandshakeError(replicaInfo.storeName);
            this.config.onSyncError?.(error);
          }
          break;
        }

        this.comms.registerReplica(replicaInfo);
        this.comms.sendMainInfo(replicaInfo.storeName, this.storeInfo);

        this.onReady();
        break;
      }

      case 'main-info': {
        throw new Error(
          'Main store cannot not receive main-info message. Do you have a replica store configured as a main store?',
        );
        break;
      }

      case 'replica-ready': {
        const from = m.from;

        if (!this.config.sync.replicaStores.includes(from)) {
          throw new Error(
            `Replica store "${from}" is not registered with main store "${this.storeName}".`,
          );
        }

        this.readyReplicas.add(from);
        this.onReady();
        break;
      }

      case 'handshake-error': {
        this.replicaSyncError = true;
        this.config.onSyncError?.(new Error('Handshake error'));
        break;
      }

      default: {
        let _exhaustiveCheck: never = type;
        throw new Error(`Unknown message type "${_exhaustiveCheck}"`);
      }
    }
  }

  private onReady() {
    if (
      this.isReady ||
      !this.comms.isReplicaInfoComplete ||
      this.readyReplicas.size !== this.totalReplicas ||
      this.replicaSyncError
    ) {
      return;
    }

    for (const tx of this.queuedTx) {
      this.comms.sendTxn(this.store, tx);
    }

    this.isReady = true;
    this.queuedTx = [];
    this.config.onSyncReady?.();
  }
}

class SyncStoreReplica<SbSync extends BareSlice, SbOther extends BareSlice> {
  public readonly store: Store;

  private isReady = false;
  private mainInfo: MainStoreInfo | null = null;
  private mainSyncError = false;
  private queuedTx: Transaction<any, any>[] = [];
  private syncManager: SyncManager;
  private storeInfo: ReplicaStoreInfo;

  constructor(
    private config: StoreConfig<SbOther> & {
      sync: SyncReplicaConfig<SbSync>;
    },
  ) {
    this.syncManager = new SyncManager({
      storeName: config.storeName,
      sync: config.sync,
      otherSlices: config.slices,
    });

    this.storeInfo = {
      storeName: config.storeName,
      syncSliceIds: this.syncManager.syncSliceIds,
      mainStoreName: config.sync.mainStore,
    };

    this.store = new Store(
      this.syncManager.initStoreState,
      config.storeName,
      this.syncedDispatch,
      config.scheduler,
      false,
      config.debug,
    );

    abortableSetTimeout(
      () => {
        this.config.sync.sendMessage({
          type: 'replica-info',
          body: this.storeInfo,
          from: this.config.storeName,
          to: this.config.sync.mainStore,
        });
      },
      this.store.destroySignal,
      0,
    );

    abortableSetTimeout(
      () => {
        if (!this.isReady) {
          config.onSyncError?.(
            new Error(`Replica store "${this.config.storeName}" timed out`),
          );
        }
      },
      this.store.destroySignal,
      500,
    );
  }

  private syncedDispatch: DispatchTx<Transaction<any, any>> = (store, tx) => {
    if (!this.syncManager.isSyncLineageId(tx.targetSliceLineage)) {
      this.config.dispatchTx(store, tx);
      return;
    }

    if (!this.isReady) {
      this.queuedTx.push(tx);
      return;
    }

    if (this.mainSyncError) {
      console.warn(
        `Replica store "${this.config.storeName}" was not able to sync with main store. Transaction "${tx.uid}" was not sent to main store.`,
      );
      return;
    }

    // send it to the main store
    // and wait on the main store to send it back via `receiveMessage`
    this.config.sync.sendMessage({
      type: 'tx',
      body: {
        tx: tx.toJSONObj(store, this.config.sync.payloadSerializer),
      },
      from: this.config.storeName,
      to: this.config.sync.mainStore,
    });
  };

  public receiveMessage(m: SyncMessage) {
    const type = m.type;
    switch (type) {
      case 'tx': {
        const tx = Transaction.fromJSONObj(
          this.store,
          m.body.tx,
          this.config.sync.payloadParser,
        );

        // tx is coming from main store directly apply it to the local store
        this.config.dispatchTx(this.store, tx);
        break;
      }

      case 'replica-info':
      case 'replica-ready': {
        throw new Error(
          'Replica store should not receive replica-info/replica-ready message',
        );
        break;
      }

      case 'main-info': {
        try {
          validateMainInfo(m.body, this.storeInfo);
        } catch (error) {
          if (error instanceof Error) {
            this.mainSyncError = true;
            this.config.sync.sendMessage({
              type: 'handshake-error',
              from: this.config.storeName,
              to: this.config.sync.mainStore,
            });
            this.config.onSyncError?.(error);
          }
          break;
        }

        this.mainInfo = m.body;

        this.config.sync.sendMessage({
          type: 'replica-ready',
          from: this.config.storeName,
          to: this.config.sync.mainStore,
        });
        this.onReady();
        break;
      }

      case 'handshake-error': {
        this.mainSyncError = true;
        this.config.onSyncError?.(new Error('Handshake error'));
        break;
      }

      default: {
        let _exhaustiveCheck: never = type;
        throw new Error(`Unknown message type "${_exhaustiveCheck}"`);
      }
    }
  }

  private onReady() {
    if (!this.mainInfo || this.isReady) {
      return;
    }

    this.isReady = true;

    for (const tx of this.queuedTx) {
      this.syncedDispatch(this.store, tx);
    }

    this.queuedTx = [];
    this.config.onSyncReady?.();
  }
}

function validateReplicaInfo(
  replicaInfo: ReplicaStoreInfo,
  mainStoreConfig: MainStoreInfo,
) {
  if (replicaInfo.mainStoreName !== mainStoreConfig.storeName) {
    throw new Error(
      `Invalid Sync setup. Replica store "${replicaInfo.storeName}" is configured to sync with main store "${replicaInfo.mainStoreName}" but main store is "${mainStoreConfig.storeName}".`,
    );
  }

  for (const path of replicaInfo.syncSliceIds) {
    if (!mainStoreConfig.syncSliceIds.includes(path)) {
      throw new Error(
        `Invalid Sync setup. Slice "${path}" is defined in replica store "${replicaInfo.storeName}" but not in main store "${mainStoreConfig.storeName}".`,
      );
    }
  }
}

function validateMainInfo(
  mainStoreInfo: MainStoreInfo,
  replicaConfig: ReplicaStoreInfo,
) {
  if (!mainStoreInfo.replicaStoreNames.includes(replicaConfig.storeName)) {
    throw new Error(
      `Invalid Sync setup. Main store "${mainStoreInfo.storeName}" is not configured to sync with replica store "${replicaConfig.storeName}"`,
    );
  }

  if (replicaConfig.mainStoreName !== mainStoreInfo.storeName) {
    throw new Error(
      `Invalid Sync setup. Replica store "${replicaConfig.storeName}" is configured to sync with main store "${replicaConfig.mainStoreName}" but found "${mainStoreInfo.storeName}".`,
    );
  }

  for (const path of replicaConfig.syncSliceIds) {
    if (!mainStoreInfo.syncSliceIds.includes(path)) {
      throw new Error(
        `Invalid Sync setup. Slice "${path}" is defined in replica store "${mainStoreInfo.storeName}" but not in main store "${replicaConfig.mainStoreName}".`,
      );
    }
  }
}
