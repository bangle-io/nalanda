import { assertNotUndefined } from '../sync/helpers';
import { weakCache } from './helpers';
import { LineageId, StableSliceId } from './internal-types';
import { BareSlice } from './slice';
import {
  expandSlices,
  validatePathMap,
  validateSlices,
} from './slices-helpers';
import { Transaction } from './transaction';

export type ResolveSliceIfRegistered<
  SL extends BareSlice,
  SliceRegistry extends BareSlice,
> = SL extends BareSlice<infer N, any>
  ? N extends SliceRegistry['name']
    ? SL
    : never
  : never;

interface StoreStateConfig {
  readonly stableToLineage: Record<StableSliceId, LineageId>;
  readonly lineageToStable: Record<LineageId, StableSliceId>;
  readonly lookupByLineage: Record<LineageId, BareSlice>;
}

interface StoreStateOpts {
  debug?: boolean;
  scope?: LineageId;
}

const createSliceLineageLookup = (
  slices: BareSlice[],
): StoreStateConfig['lookupByLineage'] => {
  return Object.fromEntries(slices.map((s) => [s.lineageId, s]));
};

export const sliceDepLineageLookup = weakCache(
  (slice: BareSlice): Set<LineageId> => {
    return new Set(slice.spec.dependencies.map((sl) => sl.lineageId));
  },
);

export class StoreState<RegSlices extends BareSlice = any> {
  static createWithExpanded<SL extends BareSlice>(
    expanded: ReturnType<typeof expandSlices>,
    initStateOverride?: Record<LineageId, unknown>,
  ): StoreState<SL> {
    const { slices, pathMap, reversePathMap } = expanded;
    validateSlices(slices);

    validatePathMap(pathMap, reversePathMap);

    const instance = new StoreState(slices, {
      lineageToStable: pathMap,
      stableToLineage: reversePathMap,
      lookupByLineage: createSliceLineageLookup(slices),
    });

    for (const slice of slices) {
      instance.slicesCurrentState[slice.lineageId] = slice.initState;
    }

    if (initStateOverride) {
      const overriddenSlices = new Set<string>(Object.keys(initStateOverride));
      for (const slice of slices) {
        if (initStateOverride[slice.lineageId] !== undefined) {
          instance.slicesCurrentState[slice.lineageId] =
            initStateOverride[slice.lineageId];

          overriddenSlices.delete(slice.lineageId);
        }
      }
      if (overriddenSlices.size > 0) {
        throw new Error(
          `Some slice names (${[...overriddenSlices].join(
            ',',
          )}) in initStateOverride were not found in the provided slices`,
        );
      }
    }

    return instance;
  }

  /**
   *
   * @param _slices - the slices to use to create the store state
   * @param initStateOverride - optional state to override the initial state of the slices
   *                          Note! that this is a record of slice name and not slice key.
   *                          If there are multiple slices with the same name, all of them will be overridden.
   * @returns
   */
  static create<SL extends BareSlice>(
    slices: SL[],
    initStateOverride?: Record<LineageId, unknown>,
  ): StoreState<SL> {
    return StoreState.createWithExpanded(
      expandSlices(slices),
      initStateOverride,
    );
  }

  static fork(
    store: StoreState,
    slicesState: Record<string, unknown> = store.slicesCurrentState,
    opts: (opts: StoreStateOpts) => StoreStateOpts = (opts) => opts,
  ): StoreState {
    const newOpts = opts(store.opts);

    const newInstance = new StoreState(store._slices, store.config, newOpts);
    newInstance.slicesCurrentState = slicesState;
    return newInstance;
  }

  // scope the state to be only accessed by a specific slice
  // and its dependencies
  static scoped(store: StoreState, lineageId: LineageId): StoreState {
    return StoreState.fork(
      store,
      undefined,
      (opts): StoreStateOpts => ({
        ...opts,
        scope: lineageId,
      }),
    );
  }

  static getSliceState(storeState: StoreState<any>, _sl: BareSlice): unknown {
    const sl = storeState.config.lookupByLineage[_sl.lineageId];

    if (!sl) {
      throw new Error(`Slice "${_sl.name}" not found in store`);
    }

    const scopeId = storeState.opts.scope;

    if (scopeId && scopeId !== _sl.lineageId) {
      const scopedSlice = storeState.config.lookupByLineage[scopeId];

      if (
        !scopedSlice ||
        // TODO make this deep dependency lookup? this is because they can in theory pass it around
        // so in theory a deep dependency lookup is what we want.
        !sliceDepLineageLookup(scopedSlice).has(_sl.lineageId)
      ) {
        throw new Error(
          `Slice "${sl.name}" is not included in the dependencies of the scoped slice "${scopedSlice?.name}"`,
        );
      }
    }

    let result = storeState._getDirectSliceState(sl.lineageId);
    if (!result.found) {
      throw new Error(
        `Slice "${sl.name}" "${sl.lineageId}" not found in store`,
      );
    }
    return result.value;
  }

  static getSlice(
    state: StoreState,
    lineageId: LineageId,
  ): BareSlice | undefined {
    return state.config.lookupByLineage[lineageId];
  }

  static getSlices(storeState: StoreState<any>): BareSlice[] {
    return storeState._slices;
  }

  static getStableSliceId(
    storeState: StoreState,
    lineageId: LineageId,
  ): StableSliceId {
    const sliceId = storeState.config.lineageToStable[lineageId];
    assertNotUndefined(sliceId, `Slice "${lineageId}" not found in store`);
    return sliceId;
  }

  static getLineageId(
    storeState: StoreState,
    stableSliceId: StableSliceId,
  ): LineageId {
    const lineageId = storeState.config.stableToLineage[stableSliceId];
    assertNotUndefined(
      lineageId,
      `Slice "${stableSliceId}" not found in store`,
    );
    return lineageId;
  }

  protected slicesCurrentState: Record<LineageId, unknown> =
    Object.create(null);

  constructor(
    protected readonly _slices: BareSlice[],
    protected readonly config: StoreStateConfig,
    protected readonly opts: StoreStateOpts = {},
  ) {}

  applyTransaction(
    tx: Transaction<RegSlices['name'], unknown[]>,
  ): StoreState<RegSlices> {
    const newState = { ...this.slicesCurrentState };
    const newStoreState = StoreState.fork(this, newState);

    let found = false;

    for (const slice of this._slices) {
      if (slice.lineageId === tx.targetSliceLineage) {
        found = true;

        const sliceState = newStoreState._getDirectSliceState(slice.lineageId);

        if (!sliceState.found) {
          throw new Error(
            `Slice "${slice.lineageId}" or one of its dependencies not found in store`,
          );
        }

        newState[slice.lineageId] = slice.applyTx(
          sliceState.value,
          newStoreState,
          tx,
        );
      }
    }

    if (!found) {
      return this;
    }

    return newStoreState;
  }

  private _getDirectSliceState(lineageId: LineageId) {
    if (
      Object.prototype.hasOwnProperty.call(this.slicesCurrentState, lineageId)
    ) {
      return {
        found: true,
        value: this.slicesCurrentState[lineageId]!,
      };
    }

    return { found: false, value: undefined };
  }
}
