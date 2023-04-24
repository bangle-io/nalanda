import { Store, Transaction } from '../vanilla';
import { AnySlice } from '../vanilla/slice';
import { DispatchTx } from '../vanilla/store';
import { abortableSetTimeout, SyncManager, SyncReplicaConfig } from './helpers';
import type {
  MainStoreInfo,
  ReplicaStoreInfo,
  StoreConfig,
  SyncMessage,
} from './sync-store';

export class SyncStoreReplica<
  SbSync extends AnySlice,
  SbOther extends AnySlice,
> {
  public readonly store: Store;

  private isReady = false;
  private mainInfo: MainStoreInfo | null = null;
  private mainSyncError = false;
  private queuedTx: Transaction<any, any>[] = [];
  private syncManager: SyncManager;
  private storeInfo: ReplicaStoreInfo;

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
