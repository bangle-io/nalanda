import { Store, Transaction } from '../vanilla';
import { Scheduler, timeoutSchedular } from '../vanilla/effect';
import { changeBareSlice, weakCache } from '../vanilla/helpers';
import { AnySlice } from '../vanilla/public-types';
import { BareSlice } from '../vanilla/slice';
import { expandSlices } from '../vanilla/slices-helpers';
import { InternalStoreState } from '../vanilla/state';
import { DispatchTx } from '../vanilla/store';
import { DebugFunc } from '../vanilla/transaction';
import { abortableSetTimeout } from './helpers';

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
      body: Transaction<any, any>;
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
  syncSliceKeys: string[];
}

export interface MainStoreInfo {
  storeName: string;
  syncSliceKeys: string[];
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
  dispatchTx?: DispatchTx<Transaction<any, any>>;
  scheduler: Scheduler;
  slices: SL[];
  storeName: string;
  debug?: DebugFunc;
  onSyncError?: (err: Error) => void;
  onSyncReady?: () => void;
}

interface SyncMainConfig<SbSync extends BareSlice> {
  type: 'main';
  slices: SbSync[];
  replicaStores: string[];
  sendMessage: (message: SyncMessage) => void;
  validate?: ({ syncSlices }: { syncSlices: AnySlice[] }) => void;
}

interface SyncReplicaConfig<SbSync extends BareSlice> {
  type: 'replica';
  mainStore: string;
  slices: SbSync[];
  sendMessage: (message: SyncMessage) => void;
  validate?: ({ syncSlices }: { syncSlices: AnySlice[] }) => void;
}

export const sliceKeyToReplicaStoreLookup = weakCache(
  (
    replicaInfoMap: Record<string, ReplicaStoreInfo>,
  ): Record<string, string[]> => {
    const sliceKeyRecord: Record<string, string[]> = {};
    for (const [replicaStoreName, info] of Object.entries(replicaInfoMap)) {
      for (const sliceKey of info.syncSliceKeys) {
        let val = sliceKeyRecord[sliceKey];
        if (!val) {
          val = [];
          sliceKeyRecord[sliceKey] = val;
        }
        val.push(replicaStoreName);
      }
    }

    return sliceKeyRecord;
  },
);

export function createSyncState({
  type,
  syncSlices,
  otherSlices,
}: {
  type: 'main' | 'replica';
  syncSlices: BareSlice[];
  otherSlices: BareSlice[];
}) {
  syncSlices = expandSlices(syncSlices);

  if (type === 'replica') {
    // Replica slices cannot have side effects running, since main store will also
    // run the side effects and we donot want them to compete with each other.
    syncSlices = syncSlices.map((slice) =>
      changeBareSlice(slice, (sl) => sl.withoutEffects()),
    );
  }

  const syncSliceKeys = new Set(syncSlices.map((s) => s.key));

  return {
    syncSliceKeys,
    syncSlices,
    state: InternalStoreState.create([
      ...syncSlices,
      ...expandSlices(otherSlices),
    ]),
  };
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
        })
      : new SyncStoreReplica({
          ...config,
          sync,
        });

  return store;
}

const defaultDispatchTx: DispatchTx<Transaction<any, any>> = (store, tx) => {
  let newState = store.state.applyTransaction(tx);
  store.updateState(newState, tx);
};

export const sendTxToReplicas = (
  mainStoreName: string,
  replicaInfos: Record<string, ReplicaStoreInfo>,
  tx: Transaction<any, any>,
  send: (message: Extract<SyncMessage, { type: 'tx' }>) => void,
) => {
  const storeNames =
    sliceKeyToReplicaStoreLookup(replicaInfos)[tx.targetSliceKey];

  if (!storeNames) {
    console.warn(`No replica store found for slice key ${tx.targetSliceKey}`);
    return;
  }

  for (const replicaStoreName of storeNames) {
    send({
      type: 'tx',
      body: tx,
      from: mainStoreName,
      to: replicaStoreName,
    });
  }
};

type Channel = {
  send?: (message: SyncMessage) => void;
  readonly receive: (message: SyncMessage) => void;
};

class SyncStoreMain<SbSync extends BareSlice, SbOther extends BareSlice> {
  public readonly store: Store;
  public sendMessage: (message: SyncMessage) => void;

  private providedDispatchTx: DispatchTx<Transaction<any, any>>;
  private isReady = false;
  private queuedTx: Transaction<any, any>[] = [];
  private readonly storeName: string;
  private readyReplicas = new Set<string>();
  private replicaInfos: Record<string, ReplicaStoreInfo> = {};
  private replicaSyncError = false;
  private onSyncReady: undefined | (() => void);
  private onSyncError: undefined | ((error: Error) => void);

  private providedReplicatedStoreNames: string[];

  private readonly syncSliceKeys: Set<string>;
  private readonly syncSlices: BareSlice[];

  private storeInfo: MainStoreInfo;

  private dispatchTx = (store: Store, tx: Transaction<any, any>) => {
    this.providedDispatchTx(store, tx);

    if (!this.syncSliceKeys.has(tx.targetSliceKey)) {
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
      sendTxToReplicas(this.storeName, this.replicaInfos, tx, this.sendMessage);
    }
  };

  constructor(
    private config: {
      sync: SyncMainConfig<SbSync>;
    } & StoreConfig<SbOther>,
  ) {
    const { storeName, sync, debug, scheduler, dispatchTx } = config;
    this.storeName = storeName;

    this.providedDispatchTx = dispatchTx || defaultDispatchTx;

    this.onSyncReady = config.onSyncReady;
    this.onSyncError = config.onSyncError;
    this.sendMessage = config.sync.sendMessage;

    this.providedReplicatedStoreNames = sync.replicaStores;
    const {
      state: internalState,
      syncSliceKeys,
      syncSlices,
    } = createSyncState({
      syncSlices: config.sync.slices,
      otherSlices: config.slices,
      type: 'main',
    });

    this.syncSliceKeys = syncSliceKeys;
    this.syncSlices = syncSlices;

    config.sync.validate?.({ syncSlices: syncSlices as AnySlice[] });

    this.storeInfo = {
      storeName,
      syncSliceKeys: [...syncSliceKeys],
      replicaStoreNames: sync.replicaStores,
    };

    // keep this as the last thing ALWAYS to avoid
    this.store = new Store(
      internalState as InternalStoreState,
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
        const tx = m.body;
        const targetSliceKey = tx.targetSliceKey;
        if (!(tx instanceof Transaction)) {
          throw new Error(
            `SyncStoreMain received a message with a body that was not a Transaction.`,
          );
        }
        if (!this.syncSliceKeys.has(targetSliceKey)) {
          throw new Error(
            `Slice "${targetSliceKey}" not found. Main store "${this.storeName}" received transaction targeting a slice which was not found in the sync slices.`,
          );
        }

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
            this.sendMessage({
              type: 'handshake-error',
              from: this.storeName,
              to: replicaInfo.storeName,
            });
            this.onSyncError?.(error);
          }
          break;
        }
        this.replicaInfos[replicaInfo.storeName] = replicaInfo;

        this.sendMessage({
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

        if (!this.providedReplicatedStoreNames.includes(from)) {
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
        this.onSyncError?.(new Error('Handshake error'));
        break;
      }

      default: {
        let _exhaustiveCheck: never = type;
        throw new Error(`Unknown message type "${_exhaustiveCheck}"`);
      }
    }
  }

  private onReady() {
    const totalReplicas = this.providedReplicatedStoreNames.length;
    if (
      this.isReady ||
      Object.keys(this.replicaInfos).length !== totalReplicas ||
      this.readyReplicas.size !== totalReplicas ||
      this.replicaSyncError
    ) {
      return;
    }

    for (const tx of this.queuedTx) {
      sendTxToReplicas(this.storeName, this.replicaInfos, tx, this.sendMessage);
    }

    this.isReady = true;
    this.queuedTx = [];
    this.onSyncReady?.();
  }
}

class SyncStoreReplica<SbSync extends BareSlice, SbOther extends BareSlice> {
  public readonly store: Store;
  public sendMessage: (message: SyncMessage) => void;

  private isReady = false;
  private mainInfo: MainStoreInfo | null = null;
  private mainStoreName: string;
  private mainSyncError = false;
  private queuedTx: Transaction<any, any>[] = [];
  private readonly syncSliceKeys: Set<string>;
  private readonly syncSlices: BareSlice[];
  private storeInfo: ReplicaStoreInfo;
  private storeName: string;

  private localDispatch: DispatchTx<Transaction<any, any>>;

  private onSyncReady: (() => void) | undefined;
  private onSyncError: ((error: Error) => void) | undefined;

  constructor({
    scheduler = timeoutSchedular(10),
    sync,
    slices,
    storeName,
    dispatchTx = defaultDispatchTx,
    debug,
    onSyncError,
    onSyncReady,
  }: StoreConfig<SbOther> & {
    sync: SyncReplicaConfig<SbSync>;
  }) {
    const {
      state: internalState,
      syncSliceKeys,
      syncSlices,
    } = createSyncState({
      syncSlices: sync.slices,
      otherSlices: slices,
      type: 'replica',
    });

    sync.validate?.({ syncSlices: syncSlices as AnySlice[] });

    this.localDispatch = dispatchTx;
    this.mainStoreName = sync.mainStore;
    this.onSyncReady = onSyncReady;
    this.onSyncError = onSyncError;
    this.sendMessage = sync.sendMessage;
    this.storeInfo = {
      storeName,
      syncSliceKeys: [...syncSliceKeys],
      mainStoreName: sync.mainStore,
    };
    this.storeName = storeName;
    this.syncSliceKeys = syncSliceKeys;
    this.syncSlices = syncSlices;

    // keep this as the last thing ALWAYS to avoid
    this.store = new Store(
      internalState as InternalStoreState,
      storeName,
      this.syncedDispatch,
      scheduler,
      false,
      debug,
    );

    abortableSetTimeout(
      () => {
        this.sendMessage({
          type: 'replica-info',
          body: this.storeInfo,
          from: this.storeName,
          to: this.mainStoreName,
        });
      },
      this.store.destroySignal,
      0,
    );

    abortableSetTimeout(
      () => {
        if (!this.isReady) {
          onSyncError?.(
            new Error(`Replica store "${this.storeName}" timed out`),
          );
        }
      },
      this.store.destroySignal,
      500,
    );
  }

  private syncedDispatch: DispatchTx<Transaction<any, any>> = (store, tx) => {
    if (!this.syncSliceKeys.has(tx.targetSliceKey)) {
      this.localDispatch(store, tx);
      return;
    }

    if (!this.isReady) {
      this.queuedTx.push(tx);
      return;
    }

    if (this.mainSyncError) {
      console.warn(
        `Replica store "${this.storeName}" was not able to sync with main store. Transaction "${tx.uid}" was not sent to main store.`,
      );
      return;
    }

    // send it to the main store
    // and wait on the main store to send it back via `receiveMessage`
    this.sendMessage({
      type: 'tx',
      body: tx,
      from: this.storeName,
      to: this.mainStoreName,
    });
  };

  public receiveMessage(m: SyncMessage) {
    const type = m.type;
    switch (type) {
      case 'tx': {
        const tx = m.body;
        const targetSliceKey = tx.targetSliceKey;
        // it is possible replica is only focusing on a subset of slices
        if (!this.syncSliceKeys.has(targetSliceKey)) {
          console.debug(
            `Replica store "${this.storeName}" received a transaction targeting a slice which was not found in the sync slices.`,
          );
          return;
        }
        // tx is coming from main store directly apply it to the local store
        this.localDispatch(this.store, tx);
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
            this.sendMessage({
              type: 'handshake-error',
              from: this.storeName,
              to: this.mainStoreName,
            });
            this.onSyncError?.(error);
          }
          break;
        }

        this.mainInfo = m.body;

        this.sendMessage({
          type: 'replica-ready',
          from: this.storeName,
          to: this.mainStoreName,
        });
        this.onReady();
        break;
      }

      case 'handshake-error': {
        this.mainSyncError = true;
        this.onSyncError?.(new Error('Handshake error'));
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
    this.onSyncReady?.();
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

  for (const sliceKey of replicaInfo.syncSliceKeys) {
    if (!mainStoreConfig.syncSliceKeys.includes(sliceKey)) {
      throw new Error(
        `Invalid Sync setup. Slice "${sliceKey}" is defined in replica store "${replicaInfo.storeName}" but not in main store "${mainStoreConfig.storeName}".`,
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

  for (const sliceKey of replicaConfig.syncSliceKeys) {
    if (!mainStoreInfo.syncSliceKeys.includes(sliceKey)) {
      throw new Error(
        `Invalid Sync setup. Slice "${sliceKey}" is defined in replica store "${mainStoreInfo.storeName}" but not in main store "${replicaConfig.mainStoreName}".`,
      );
    }
  }
}
