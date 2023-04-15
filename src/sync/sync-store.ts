import { Store, Transaction } from '../vanilla';
import { Scheduler } from '../vanilla/effect';
import { weakCache } from '../vanilla/helpers';
import { createLineageId } from '../vanilla/internal-types';
import { BareSlice } from '../vanilla/slice';
import { StoreState } from '../vanilla/state';
import { DispatchTx } from '../vanilla/store';
import { DebugFunc } from '../vanilla/transaction';
import {
  abortableSetTimeout,
  assertNotUndefined,
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
      body: { tx: Transaction<any, any>; targetPath: string };
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
  syncSlicePaths: string[];
}

export interface MainStoreInfo {
  storeName: string;
  syncSlicePaths: string[];
  replicaStoreNames: string[];
}

export interface MainChannel {
  sendTxToReplicas(replicaStoreName: string, tx: Transaction<any, any>): void;
  destroy(): void;
}

export interface ReplicaChannel {
  sendTxToMain(tx: Transaction<any, any>): void;
  getMainStoreInfo: (replicaInfo: ReplicaStoreInfo) => Promise<MainStoreInfo>;
  destroy(): void;
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

export const pathToReplicaStoreLookup = weakCache(
  (
    replicaInfoMap: Record<string, ReplicaStoreInfo>,
  ): Record<string, string[]> => {
    const slicePathRecord: Record<string, string[]> = {};
    for (const [replicaStoreName, info] of Object.entries(replicaInfoMap)) {
      for (const path of info.syncSlicePaths) {
        let val = slicePathRecord[path];
        if (!val) {
          val = [];
          slicePathRecord[path] = val;
        }
        val.push(replicaStoreName);
      }
    }

    return slicePathRecord;
  },
);

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

export const sendTxToReplicas = (
  store: Store,
  replicaInfos: Record<string, ReplicaStoreInfo>,
  tx: Transaction<any, any>,
  send: (message: Extract<SyncMessage, { type: 'tx' }>) => void,
  syncManager: SyncManager,
) => {
  const targetPath = syncManager.lineageIdToPath(tx.targetSliceLineage);

  assertNotUndefined(
    targetPath,
    `targetPath cannot not be undefined, check ${tx.targetSliceLineage}`,
  );

  const storeNames = pathToReplicaStoreLookup(replicaInfos)[targetPath];

  if (!storeNames) {
    console.warn(`No replica store found for slice path ${targetPath}`);
    return;
  }

  for (const replicaStoreName of storeNames) {
    send({
      type: 'tx',
      body: {
        tx: tx.change({
          // lineage id are not guaranteed the same across the stores,
          // path is stable and should be used to get the correct
          // lineage id in the replica store.
          targetSliceLineage: createLineageId('<PURGED>'),
          sourceSliceLineage: createLineageId(
            `<FOREIGN_STORE(${store.storeName})>`,
          ),
        }),
        targetPath,
      },
      from: store.storeName,
      to: replicaStoreName,
    });
  }
};

class SyncStoreMain<SbSync extends BareSlice, SbOther extends BareSlice> {
  public readonly store: Store;

  private isReady = false;
  private queuedTx: Transaction<any, any>[] = [];
  private readonly storeName: string;
  private readyReplicas = new Set<string>();
  private replicaInfos: Record<string, ReplicaStoreInfo> = {};
  private replicaSyncError = false;

  private readonly syncManager: SyncManager;

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
      sendTxToReplicas(
        store,
        this.replicaInfos,
        tx,
        this.config.sync.sendMessage,
        this.syncManager,
      );
    }
  };

  constructor(
    private config: {
      sync: SyncMainConfig<SbSync>;
    } & StoreConfig<SbOther>,
  ) {
    const { storeName, sync, debug, scheduler } = config;
    this.storeName = storeName;

    this.syncManager = new SyncManager({
      otherSlices: config.slices,
      sync: this.config.sync,
    });

    this.storeInfo = {
      storeName,
      syncSlicePaths: this.syncManager.syncSlicePaths,
      replicaStoreNames: sync.replicaStores,
    };

    const storeState = StoreState.create([
      ...this.syncManager.syncSlices,
      ...this.syncManager.otherSlices,
    ]);

    // keep this as the last thing ALWAYS to avoid
    this.store = new Store(
      storeState,
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
        let { tx, targetPath } = m.body;
        if (!(tx instanceof Transaction)) {
          throw new Error(
            `SyncStoreMain received a message with a body that was not a Transaction.`,
          );
        }

        let targetSliceLineage = this.syncManager.pathToLineageId(targetPath);

        if (!targetSliceLineage) {
          throw new Error(
            `Slice "${targetPath}" not found. Main store "${this.storeName}" received transaction targeting a slice which was not found in the sync slices.`,
          );
        }

        // cannot use the lineage from the transaction because it is not
        // guaranteed to be the same as the one in the main store, it is dependent on the environment
        tx = tx.change({
          targetSliceLineage,
        });

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
            this.config.sync.sendMessage({
              type: 'handshake-error',
              from: this.storeName,
              to: replicaInfo.storeName,
            });
            this.config.onSyncError?.(error);
          }
          break;
        }
        this.replicaInfos[replicaInfo.storeName] = replicaInfo;

        this.config.sync.sendMessage({
          type: 'main-info',
          body: this.storeInfo,
          from: this.storeName,
          to: replicaInfo.storeName,
        });
        this.onReady();
        break;
      }

      case 'main-info': {
        throw new Error('Main store should not receive main-info message');
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
    const totalReplicas = this.config.sync.replicaStores.length;
    if (
      this.isReady ||
      Object.keys(this.replicaInfos).length !== totalReplicas ||
      this.readyReplicas.size !== totalReplicas ||
      this.replicaSyncError
    ) {
      return;
    }

    for (const tx of this.queuedTx) {
      sendTxToReplicas(
        this.store,
        this.replicaInfos,
        tx,
        this.config.sync.sendMessage,
        this.syncManager,
      );
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
      sync: config.sync,
      otherSlices: config.slices,
    });

    this.storeInfo = {
      storeName: config.storeName,
      syncSlicePaths: this.syncManager.syncSlicePaths,
      mainStoreName: config.sync.mainStore,
    };

    const storeState = StoreState.create([
      ...this.syncManager.syncSlices,
      ...this.syncManager.otherSlices,
    ]);

    // keep this as the last thing ALWAYS to avoid
    this.store = new Store(
      storeState,
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

    const targetPath = this.syncManager.lineageIdToPath(tx.targetSliceLineage);

    assertNotUndefined(
      targetPath,
      `targetPath cannot not be undefined, check ${tx.targetSliceLineage}`,
    );

    // send it to the main store
    // and wait on the main store to send it back via `receiveMessage`
    this.config.sync.sendMessage({
      type: 'tx',
      body: {
        tx: tx.change({
          // similar to main store remove the lineage id
          targetSliceLineage: createLineageId('<PURGED>'),
          sourceSliceLineage: createLineageId(
            `<FOREIGN_STORE(${store.storeName})>`,
          ),
        }),
        targetPath: targetPath,
      },
      from: this.config.storeName,
      to: this.config.sync.mainStore,
    });
  };

  public receiveMessage(m: SyncMessage) {
    const type = m.type;
    switch (type) {
      case 'tx': {
        let { tx, targetPath } = m.body;

        let targetSliceLineage = this.syncManager.pathToLineageId(targetPath);

        // it is possible replica is only focusing on a subset of slices
        if (!targetSliceLineage) {
          console.debug(
            `Replica store "${this.config.storeName}" received a transaction targeting a slice "${targetPath}" which was not found in the sync slices.`,
          );
          return;
        }

        tx = tx.change({
          targetSliceLineage,
        });

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

  for (const path of replicaInfo.syncSlicePaths) {
    if (!mainStoreConfig.syncSlicePaths.includes(path)) {
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

  for (const path of replicaConfig.syncSlicePaths) {
    if (!mainStoreInfo.syncSlicePaths.includes(path)) {
      throw new Error(
        `Invalid Sync setup. Slice "${path}" is defined in replica store "${mainStoreInfo.storeName}" but not in main store "${replicaConfig.mainStoreName}".`,
      );
    }
  }
}
