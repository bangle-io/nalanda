import { Store, Transaction } from '../vanilla';
import { BareSlice } from '../vanilla/slice';
import { MainCommunicator, SyncMainConfig, SyncManager } from './helpers';
import type {
  MainStoreInfo,
  ReplicaStoreInfo,
  StoreConfig,
  SyncMessage,
} from './sync-store';

export class SyncStoreMain<
  SbSync extends BareSlice,
  SbOther extends BareSlice,
> {
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
