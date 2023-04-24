import { StableSliceId, Store } from '../vanilla';
import { Scheduler } from '../vanilla/effect';
import { AnySlice } from '../vanilla/slice';
import { DispatchTx } from '../vanilla/store';
import {
  Transaction,
  DebugFunc,
  JSONTransaction,
} from '../vanilla/transaction';
import { SyncMainConfig, SyncReplicaConfig } from './helpers';
import { SyncStoreMain } from './sync-store-main';
import { SyncStoreReplica } from './sync-store-replica';

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

export interface StoreConfig<SL extends AnySlice> {
  dispatchTx: DispatchTx<Transaction<any, any>>;
  scheduler: Scheduler;
  slices: SL[];
  storeName: string;
  debug?: DebugFunc;
  onSyncError?: (err: Error) => void;
  onSyncReady?: () => void;
}

const defaultDispatchTx: DispatchTx<Transaction<any, any>> = (store, tx) => {
  let newState = store.state.applyTransaction(tx);
  Store.updateState(store, newState, tx);
};

export function createSyncStore<
  SbSync extends AnySlice,
  SbOther extends AnySlice,
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
