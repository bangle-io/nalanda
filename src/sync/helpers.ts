import { changeBareSlice } from '../vanilla/helpers';
import { LineageId } from '../vanilla/internal-types';
import { AnySlice } from '../vanilla/public-types';
import { BareSlice } from '../vanilla/slice';
import { expandSlices } from '../vanilla/slices-helpers';
import { SyncMessage } from './sync-store';

export interface SyncMainConfig<SbSync extends BareSlice> {
  type: 'main';
  slices: SbSync[];
  replicaStores: string[];
  sendMessage: (message: SyncMessage) => void;
  validate?: ({ syncSlices }: { syncSlices: AnySlice[] }) => void;
}

export interface SyncReplicaConfig<SbSync extends BareSlice> {
  type: 'replica';
  mainStore: string;
  slices: SbSync[];
  sendMessage: (message: SyncMessage) => void;
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
  public readonly syncSlicePaths: string[];
  public readonly syncSlicePathsSet: Set<string>;
  private readonly syncLineageIds: Set<LineageId>;

  private readonly _lineageIdToPath: Map<LineageId, string>;
  private readonly _pathToLineageId: Map<string, LineageId>;

  // The expanded slices that need are not syced
  public readonly otherSlices: BareSlice[];

  constructor(
    public config: {
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

    this._lineageIdToPath = syncExpanded.pathMap;
    this._pathToLineageId = new Map(
      Array.from(syncExpanded.pathMap.entries()).map(
        ([k, v]): [string, LineageId] => [v, k],
      ),
    );

    this.syncLineageIds = new Set(expandedSyncSlices.map((s) => s.lineageId));
    this.syncSlicePathsSet = new Set(syncExpanded.pathMap.values());
    this.syncSlicePaths = [...this.syncSlicePathsSet];
  }

  isSyncLineageId(lineageId: LineageId): boolean {
    return this.syncLineageIds.has(lineageId);
  }

  isSyncPath(path: string) {
    return this.syncSlicePathsSet.has(path);
  }

  lineageIdToPath(lineage: LineageId): string | undefined {
    return this._lineageIdToPath.get(lineage);
  }

  pathToLineageId(path: string): LineageId | undefined {
    return this._pathToLineageId.get(path);
  }
}

function validateExpandedSlices({
  sync,
  other,
}: {
  sync: ReturnType<typeof expandSlices>;
  other: ReturnType<typeof expandSlices>;
}) {
  const syncPathsSet = new Set(sync.pathMap.values());

  if (syncPathsSet.size !== sync.slices.length) {
    throw new Error(
      'Slices are not unique. Please ensure that slices have unique name.',
    );
  }

  const otherPathsSet = new Set(other.pathMap.values());

  if (
    otherPathsSet.size + syncPathsSet.size !==
    new Set([...syncPathsSet, ...otherPathsSet]).size
  ) {
    throw new Error(
      'Slices are not unique. Please ensure that slices have unique name.',
    );
  }
}
