import {
  LineageId,
  StableSliceId,
  Store,
  StoreState,
  Transaction,
} from '../vanilla';
import { AnySlice, Slice, UnknownSlice } from '../vanilla/slice';
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

export interface SyncMainConfig<SbSync extends AnySlice> {
  type: 'main';
  slices: SbSync[];
  replicaStores: string[];
  sendMessage: (message: SyncMessage) => void;
  validate?: ({ syncSlices }: { syncSlices: UnknownSlice[] }) => void;
  payloadSerializer: PayloadSerializer;
  payloadParser: PayloadParser;
}

export interface SyncReplicaConfig<SbSync extends AnySlice> {
  type: 'replica';
  mainStore: string;
  slices: SbSync[];
  sendMessage: (message: SyncMessage) => void;
  payloadSerializer: PayloadSerializer;
  payloadParser: PayloadParser;
  validate?: ({ syncSlices }: { syncSlices: UnknownSlice[] }) => void;
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
  public readonly syncSlices: UnknownSlice[];
  public readonly syncSliceIds: StableSliceId[];
  public readonly syncSliceIdSet: Set<StableSliceId>;
  private readonly syncLineageIds: Set<LineageId>;

  // The expanded slices that need are not syced
  public readonly otherSlices: UnknownSlice[];

  public readonly initStoreState: StoreState<any>;

  constructor(
    public config: {
      storeName: string;
      sync: SyncMainConfig<AnySlice> | SyncReplicaConfig<AnySlice>;
      otherSlices: AnySlice[];
      initStateOverride?: Record<LineageId, unknown> | undefined;
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

    if (config.initStateOverride) {
      for (const [lineageId] of Object.entries(config.initStateOverride)) {
        if (!otherExpanded.pathMap[lineageId as LineageId]) {
          throw new Error(
            `Cannot override init state for slice ${lineageId} as it was not found. Override is not supported in sync slices.`,
          );
        }
      }
    }

    this.initStoreState = StoreState.createWithExpanded(
      merged,
      config.initStateOverride,
    );

    let expandedSyncSlices = syncExpanded.slices;

    if (config.sync.type === 'replica') {
      // Replica slices cannot have side effects running, since main store will also
      // run the side effects and we donot want them to compete with each other.
      expandedSyncSlices = expandedSyncSlices.map((slice) => {
        return Slice.disableEffects(slice);
      });
    }

    config.sync.validate?.({
      syncSlices: expandedSyncSlices,
    });

    this.syncSlices = expandedSyncSlices;
    this.otherSlices = otherExpanded.slices;

    this.syncLineageIds = new Set(
      expandedSyncSlices.map((s) => s.spec.lineageId),
    );
    this.syncSliceIdSet = new Set(Object.values(syncExpanded.pathMap));
    this.syncSliceIds = [...this.syncSliceIdSet];
  }

  getStableId(lineage: LineageId): StableSliceId {
    return StoreState.getStableSliceId(this.initStoreState, lineage);
  }

  isSyncLineageId(lineageId: LineageId): boolean {
    return this.syncLineageIds.has(lineageId);
  }

  isSyncPath(path: StableSliceId) {
    return this.syncSliceIdSet.has(path);
  }

  // TODO implement
  parseTxn(store: Store, txObj: JSONTransaction): Transaction<any, any[]> {
    return Transaction.fromJSONObj(
      store,
      txObj,
      this.config.sync.payloadParser,
    );
  }
  pathToLineageId(stableId: StableSliceId): LineageId {
    return StoreState.getLineageId(this.initStoreState, stableId);
  }

  // TODO implement
  serializeTxn(store: Store, tx: Transaction<any, any[]>): JSONTransaction {
    return tx.toJSONObj(store, this.config.sync.payloadSerializer);
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

  constructor(
    private readonly config: {
      storeName: string;
      totalReplicas: number;
      syncManager: SyncManager;
      sendMessage: (message: SyncMessage) => void;
    },
  ) {}
  get isReplicaInfoComplete() {
    return this.replica.complete;
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
  setupReplicaData(replicaInfos: Record<string, ReplicaStoreInfo>) {
    const lookup = getReplicaLookup(this.config.syncManager, replicaInfos);
    this.replica = {
      complete: true,
      lookup,
      infos: replicaInfos,
    };
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
