import { Store, Transaction } from '../vanilla';
import { idleCallbackScheduler, Scheduler } from '../vanilla/effect';
import { changeBareSlice, weakCache } from '../vanilla/helpers';
import { BareStore } from '../vanilla/public-types';
import { BareSlice } from '../vanilla/slice';
import { expandSlices } from '../vanilla/slices-helpers';
import { InternalStoreState } from '../vanilla/state';
import { DispatchTx } from '../vanilla/store';
import { DebugFunc } from '../vanilla/transaction';

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
  receiveTx(cb: (tx: Transaction<any, any>) => void): void;
  getReplicaStoreInfo: (replicaStoreName: string) => Promise<ReplicaStoreInfo>;
  provideMainStoreInfo: (cb: () => MainStoreInfo) => void;
  destroy(): void;
}

export interface ReplicaChannel {
  sendTxToMain(tx: Transaction<any, any>): void;
  receiveTx(cb: (tx: Transaction<any, any>) => void): void;
  getMainStoreInfo: () => Promise<MainStoreInfo>;
  provideReplicaStoreInfo: (cb: () => ReplicaStoreInfo) => void;
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
  channel: MainChannel;
}

interface SyncReplicaConfig<SbSync extends BareSlice> {
  type: 'replica';
  mainStore: string;
  slices: SbSync[];
  channel: ReplicaChannel;
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
} & StoreConfig<SbOther>): BareStore<SbSync | SbOther> {
  const store =
    sync.type === 'main'
      ? syncStoreMain({
          ...config,
          sync,
        })
      : syncStoreReplica({
          ...config,
          sync,
        });

  store.destroySignal.addEventListener(
    'abort',
    () => {
      sync.channel.destroy();
    },
    {
      once: true,
    },
  );

  return store;
}

const defaultDispatchTx: DispatchTx<Transaction<any, any>> = (store, tx) => {
  let newState = store.state.applyTransaction(tx);
  store.updateState(newState, tx);
};

export const sendTxToReplicas = (
  replicaInfos: Record<string, ReplicaStoreInfo>,
  tx: Transaction<any, any>,
  channel: MainChannel,
) => {
  const storeNames =
    sliceKeyToReplicaStoreLookup(replicaInfos)[tx.targetSliceKey];

  if (!storeNames) {
    console.warn(`No replica store found for slice key ${tx.targetSliceKey}`);
    return;
  }

  for (const replicaStoreName of storeNames) {
    channel.sendTxToReplicas(replicaStoreName, tx);
  }
};

function syncStoreMain<SbSync extends BareSlice, SbOther extends BareSlice>({
  scheduler = idleCallbackScheduler(10),
  sync,
  slices,
  storeName,
  dispatchTx = defaultDispatchTx,
  debug,
  onSyncError,
  onSyncReady,
}: {
  sync: SyncMainConfig<SbSync>;
} & StoreConfig<SbOther>) {
  const { state: internalState, syncSliceKeys } = createSyncState({
    syncSlices: sync.slices,
    otherSlices: slices,
    type: 'main',
  });

  let replicaSyncFailed = false;
  let queuedTx: Transaction<any, any>[] = [];
  let replicaInfos: Record<string, ReplicaStoreInfo> | null = null;

  // validate the replica stores
  Promise.all(
    sync.replicaStores.map((replicaStoreName) => {
      return sync.channel.getReplicaStoreInfo(replicaStoreName);
    }),
  )
    .then((infos) => {
      for (const info of infos) {
        validateReplicaInfo(info, {
          storeName: storeName,
          syncSliceKeys,
        });
      }

      replicaInfos = Object.fromEntries(
        infos.map((info) => [info.storeName, info]),
      );

      for (const tx of queuedTx) {
        sendTxToReplicas(replicaInfos, tx, sync.channel);
      }
      queuedTx = [];
      onSyncReady?.();
    })
    .catch((error) => {
      replicaSyncFailed = true;
      if (onSyncError) {
        onSyncError(error);
      } else {
        throw error;
      }
    });

  const syncDispatchTx: DispatchTx<Transaction<any, any>> = (store, tx) => {
    dispatchTx(store, tx);

    if (replicaSyncFailed) {
      console.warn(
        `Main store "${storeName}" was not able to sync with all replica stores. Transaction "${tx.uid}" was not sent to any replica stores.`,
      );
      return;
    }
    if (!replicaInfos) {
      queuedTx.push(tx);
    } else {
      // send it to all the replica stores
      sendTxToReplicas(replicaInfos, tx, sync.channel);
    }
  };

  const store = new Store(
    internalState as InternalStoreState,
    storeName,
    (store, tx) => {
      if (!syncSliceKeys.has(tx.targetSliceKey)) {
        dispatchTx(store, tx);
        return;
      }
      syncDispatchTx(store, tx);
    },
    scheduler,
    false,
    debug,
  );

  sync.channel.receiveTx((tx) => {
    const targetSliceKey = tx.targetSliceKey;

    if (!syncSliceKeys.has(targetSliceKey)) {
      throw new Error(
        `Slice "${targetSliceKey}" not found. Main store "${storeName}" received transaction targeting a slice which was not found in the sync slices.`,
      );
    }

    //  This is a transaction coming from one of the replica stores
    syncDispatchTx(store, tx);
  });

  sync.channel.provideMainStoreInfo(() => {
    return {
      storeName,
      syncSliceKeys: [...syncSliceKeys],
      replicaStoreNames: sync.replicaStores,
    };
  });

  return store;
}

function syncStoreReplica<SbSync extends BareSlice, SbOther extends BareSlice>({
  scheduler = idleCallbackScheduler(10),
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
  const { state: internalState, syncSliceKeys } = createSyncState({
    syncSlices: sync.slices,
    otherSlices: slices,
    type: 'replica',
  });

  let mainReady = false;
  let mainSyncError = false;
  let queuedTx: Transaction<any, any>[] = [];

  sync.channel
    .getMainStoreInfo()
    .then((info) => {
      validateMainInfo(info, {
        mainStoreName: sync.mainStore,
        syncSliceKeys,
        storeName,
      });

      for (const tx of queuedTx) {
        sync.channel.sendTxToMain(tx);
      }
      queuedTx = [];
      mainReady = true;
      onSyncReady?.();
    })
    .catch((error) => {
      mainSyncError = true;
      if (onSyncError) {
        onSyncError(error);
      } else {
        throw error;
      }
    });

  const localDispatch: DispatchTx<Transaction<any, any>> = (store, tx) => {
    if (!syncSliceKeys.has(tx.targetSliceKey)) {
      dispatchTx(store, tx);
      return;
    }

    if (!mainReady) {
      queuedTx.push(tx);
      return;
    }

    if (mainSyncError) {
      console.warn(
        `Replica store "${storeName}" was not able to sync with main store. Transaction "${tx.uid}" was not sent to main store.`,
      );
      return;
    }

    // send it to the main store
    // and wait on the main store to send it back to 'receiveTx'
    sync.channel.sendTxToMain(tx);
  };
  const store = new Store(
    internalState as InternalStoreState,
    storeName,
    localDispatch,
    scheduler,
    false,
    debug,
  );

  sync.channel.receiveTx((tx) => {
    const targetSliceKey = tx.targetSliceKey;
    // it is possible replica is only focusing on a subset of slices
    if (!syncSliceKeys.has(targetSliceKey)) {
      console.debug(
        `Replica store "${storeName}" received a transaction targeting a slice which was not found in the sync slices.`,
      );
      return;
    }
    // tx is coming from main store directly apply it to the local store
    dispatchTx(store, tx);
  });

  sync.channel.provideReplicaStoreInfo(() => {
    return {
      storeName,
      syncSliceKeys: [...syncSliceKeys],
      mainStoreName: sync.mainStore,
    };
  });

  return store;
}

function validateReplicaInfo(
  replicaInfo: ReplicaStoreInfo,
  mainStoreConfig: {
    storeName: string;
    syncSliceKeys: Set<string>;
  },
) {
  if (replicaInfo.mainStoreName !== mainStoreConfig.storeName) {
    throw new Error(
      `Invalid Sync setup. Replica store "${replicaInfo.storeName}" is configured to sync with main store "${replicaInfo.mainStoreName}" but main store is "${mainStoreConfig.storeName}".`,
    );
  }

  for (const sliceKey of replicaInfo.syncSliceKeys) {
    if (!mainStoreConfig.syncSliceKeys.has(sliceKey)) {
      throw new Error(
        `Invalid Sync setup. Slice "${sliceKey}" is defined in replica store "${replicaInfo.storeName}" but not in main store "${mainStoreConfig.storeName}".`,
      );
    }
  }
}

function validateMainInfo(
  mainStoreInfo: MainStoreInfo,
  replicaConfig: {
    storeName: string;
    mainStoreName: string;
    syncSliceKeys: Set<string>;
  },
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
