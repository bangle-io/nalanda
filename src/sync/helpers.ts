import { StableSliceId, Store, StoreState, Transaction } from '../vanilla';
import { changeBareSlice } from '../vanilla/helpers';
import { LineageId } from '../vanilla/internal-types';
import { AnySlice } from '../vanilla/public-types';
import { BareSlice } from '../vanilla/slice';
import { expandSlices } from '../vanilla/slices-helpers';
import {
  JSONTransaction,
  PayloadParser,
  PayloadSerializer,
} from '../vanilla/transaction';
import type {
  MainStoreInfo,
  ReplicaStoreInfo,
  SyncMessage,
} from './sync-store';

export interface SyncMainConfig<SbSync extends BareSlice> {
  type: 'main';
  slices: SbSync[];
  replicaStores: string[];
  sendMessage: (message: SyncMessage) => void;
  validate?: ({ syncSlices }: { syncSlices: AnySlice[] }) => void;
  payloadSerializer: PayloadSerializer;
  payloadParser: PayloadParser;
}

export interface SyncReplicaConfig<SbSync extends BareSlice> {
  type: 'replica';
  mainStore: string;
  slices: SbSync[];
  sendMessage: (message: SyncMessage) => void;
  payloadSerializer: PayloadSerializer;
  payloadParser: PayloadParser;
  validate?: ({ syncSlices }: { syncSlices: AnySlice[] }) => void;
}

export function abortableSetTimeout(
  callback: () => void,
  signal: AbortSignal,
  ms: number,
): void {
  const timer = setTimeout(callback, ms);
  signal.addEventListener(
    'abort',
    () => {
      clearTimeout(timer);
    },
    { once: true },
  );
}

export function assertNotUndefined(
  value: unknown,
  message: string,
): asserts value {
  if (value === undefined) {
    throw new Error(`assertion failed: ${message}`);
  }
}

export class SyncManager {
  // The expanded (flattens out the deeply nested slices) slices that need to be synced
  public readonly syncSlices: BareSlice[];
  public readonly syncSliceIds: StableSliceId[];
  public readonly syncSliceIdSet: Set<StableSliceId>;
  private readonly syncLineageIds: Set<LineageId>;

  // The expanded slices that need are not syced
  public readonly otherSlices: BareSlice[];

  public readonly initStoreState: StoreState;

  constructor(
    public config: {
      storeName: string;
      sync: SyncMainConfig<BareSlice> | SyncReplicaConfig<BareSlice>;
      otherSlices: BareSlice[];
    },
  ) {
    let syncExpanded = expandSlices(config.sync.slices);
    let otherExpanded = expandSlices(config.otherSlices);
    validateExpandedSlices({
      sync: syncExpanded,
      other: otherExpanded,
    });

    const merged: ReturnType<typeof expandSlices> = {
      slices: [...syncExpanded.slices, ...otherExpanded.slices],
      pathMap: {
        ...syncExpanded.pathMap,
        ...otherExpanded.pathMap,
      },
      reversePathMap: {
        ...syncExpanded.reversePathMap,
        ...otherExpanded.reversePathMap,
      },
    };

    this.initStoreState = StoreState.createWithExpanded(merged);

    let expandedSyncSlices = syncExpanded.slices;

    if (config.sync.type === 'replica') {
      // Replica slices cannot have side effects running, since main store will also
      // run the side effects and we donot want them to compete with each other.
      expandedSyncSlices = expandedSyncSlices.map((slice) =>
        changeBareSlice(slice, (sl) => sl.withoutEffects()),
      );
    }

    config.sync.validate?.({
      syncSlices: expandedSyncSlices as AnySlice[],
    });

    this.syncSlices = expandedSyncSlices;
    this.otherSlices = otherExpanded.slices;

    this.syncLineageIds = new Set(expandedSyncSlices.map((s) => s.lineageId));
    this.syncSliceIdSet = new Set(Object.values(syncExpanded.pathMap));
    this.syncSliceIds = [...this.syncSliceIdSet];
  }

  isSyncLineageId(lineageId: LineageId): boolean {
    return this.syncLineageIds.has(lineageId);
  }

  isSyncPath(path: StableSliceId) {
    return this.syncSliceIdSet.has(path);
  }

  getStableId(lineage: LineageId): StableSliceId {
    return StoreState.getStableSliceId(this.initStoreState, lineage);
  }

  pathToLineageId(stableId: StableSliceId): LineageId {
    return StoreState.getLineageId(this.initStoreState, stableId);
  }

  // TODO implement
  serializeTxn(store: Store, tx: Transaction<any, any[]>): JSONTransaction {
    return tx.toJSONObj(store, this.config.sync.payloadSerializer);
  }

  // TODO implement
  parseTxn(store: Store, txObj: JSONTransaction): Transaction<any, any[]> {
    return Transaction.fromJSONObj(
      store,
      txObj,
      this.config.sync.payloadParser,
    );
  }
}
function validateExpandedSlices({
  sync,
  other,
}: {
  sync: ReturnType<typeof expandSlices>;
  other: ReturnType<typeof expandSlices>;
}) {
  const syncPathsSet = new Set(Object.keys(sync.pathMap));

  const otherPathsSet = new Set(Object.keys(other.pathMap));

  if (
    otherPathsSet.size + syncPathsSet.size !==
    new Set([...syncPathsSet, ...otherPathsSet]).size
  ) {
    throw new Error(
      'Sync slices and other slices are not unique. Please ensure that slices have unique name.',
    );
  }
}

export class MainCommunicator {
  // Maps lineageId to the replica store names
  // replicaLookup: Record<LineageId, string[]>;
  replica:
    | {
        interimInfos: Record<string, ReplicaStoreInfo>;
        complete: false;
      }
    | {
        complete: true;
        lookup: Record<LineageId, string[]>;
        infos: Record<string, ReplicaStoreInfo>;
      } = {
    complete: false,
    interimInfos: {},
  };

  get isReplicaInfoComplete() {
    return this.replica.complete;
  }

  constructor(
    private readonly config: {
      storeName: string;
      totalReplicas: number;
      syncManager: SyncManager;
      sendMessage: (message: SyncMessage) => void;
    },
  ) {}

  setupReplicaData(replicaInfos: Record<string, ReplicaStoreInfo>) {
    const lookup = getReplicaLookup(this.config.syncManager, replicaInfos);
    this.replica = {
      complete: true,
      lookup,
      infos: replicaInfos,
    };
  }

  registerReplica(replicaInfo: ReplicaStoreInfo) {
    if (this.replica.complete) {
      throw new Error('Replica already setup');
    }

    this.replica.interimInfos[replicaInfo.storeName] = replicaInfo;

    if (
      Object.keys(this.replica.interimInfos).length ===
      this.config.totalReplicas
    ) {
      this.setupReplicaData(this.replica.interimInfos);
    }
  }

  sendTxn(store: Store, tx: Transaction<any, any[]>) {
    if (!this.replica.complete) {
      throw new Error('Replica not setup');
    }

    const { syncManager } = this.config;
    const replicaStores = this.replica.lookup[tx.targetSliceLineage];

    if (!replicaStores) {
      console.warn(`No replica store found for slice ${tx.targetSliceLineage}`);
      return;
    }

    for (const replicaStore of replicaStores) {
      this.config.sendMessage({
        type: 'tx',
        body: {
          tx: syncManager.serializeTxn(store, tx),
        },
        from: syncManager.config.storeName,
        to: replicaStore,
      });
    }
  }

  sendHandshakeError(to: string) {
    this.config.sendMessage({
      type: 'handshake-error',
      from: this.config.storeName,
      to,
    });
  }

  sendMainInfo(to: string, storeInfo: MainStoreInfo) {
    this.config.sendMessage({
      type: 'main-info',
      body: storeInfo,
      from: this.config.storeName,
      to: to,
    });
  }
}

export function getReplicaLookup(
  syncManager: SyncManager,
  replicaInfos: Record<string, ReplicaStoreInfo>,
): Record<LineageId, string[]> {
  const slicePathRecord: Record<LineageId, string[]> = {};
  for (const [replicaStoreName, info] of Object.entries(replicaInfos)) {
    for (const path of info.syncSliceIds) {
      const lineageId = syncManager.pathToLineageId(path);

      let val = slicePathRecord[lineageId];
      if (!val) {
        val = [];
        slicePathRecord[lineageId] = val;
      }
      val.push(replicaStoreName);
    }
  }

  return slicePathRecord;
}
