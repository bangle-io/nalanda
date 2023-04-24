import { assertNotUndefined, weakCache } from './helpers';
import type {
  UnknownSlice,
  AnySliceWithName,
  UnknownSliceWithName,
  AnySlice,
} from './slice';
import {
  ExpandSlice,
  expandSlices,
  validatePathMap,
  createSliceLineageLookup,
  validateSlices,
} from './slices-helpers';
import type { Transaction } from './transaction';
import type { LineageId, StableSliceId } from './types';

interface InputStoreStateSpec<TSliceName extends string> {
  readonly slices: UnknownSliceWithName<TSliceName>[];
  readonly stableToLineage: Record<StableSliceId, LineageId>;
  readonly lineageToStable: Record<LineageId, StableSliceId>;
  readonly lookupByLineage: Record<LineageId, UnknownSlice>;
}

interface StoreStateConfig {
  readonly scope?: LineageId;
}

export const sliceDepLineageLookup = weakCache(
  (slice: UnknownSlice): Set<LineageId> => {
    return new Set(slice.spec.dependencies.map((sl) => sl.spec.lineageId));
  },
);

export class StoreState<TSliceName extends string> {
  static create<TSliceName extends string>(
    slices: AnySliceWithName<TSliceName>[],
    initStateOverride?: Record<LineageId, unknown>,
  ): StoreState<TSliceName> {
    return StoreState.createWithExpanded(
      expandSlices(slices),
      initStateOverride,
    ) as any;
  }
  static createWithExpanded<TSliceName extends string>(
    expanded: ExpandSlice<AnySliceWithName<TSliceName>>,
    initStateOverride?: Record<LineageId, unknown>,
  ): StoreState<TSliceName> {
    const { slices, pathMap, reversePathMap } = expanded;
    validateSlices(slices);

    validatePathMap(pathMap, reversePathMap);

    const instance = new StoreState(
      {
        slices,
        lineageToStable: pathMap,
        stableToLineage: reversePathMap,
        lookupByLineage: createSliceLineageLookup(slices),
      },
      {},
    );

    for (const slice of slices) {
      instance.slicesCurrentState[slice.spec.lineageId] = slice.spec.initState;
    }

    if (initStateOverride) {
      const overriddenSlices = new Set<string>(Object.keys(initStateOverride));
      for (const slice of slices) {
        if (initStateOverride[slice.spec.lineageId] !== undefined) {
          instance.slicesCurrentState[slice.spec.lineageId] =
            initStateOverride[slice.spec.lineageId];

          overriddenSlices.delete(slice.spec.lineageId);
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

  // TODO improve this as it is running on every call, we dont need to
  static getDerivedState(storeState: StoreState<any>, _sl: AnySlice): unknown {
    const callback = _sl.spec.derivedState(storeState, _sl);
    return callback(storeState);
  }

  static getLineageId(
    state: StoreState<any>,
    stableSliceId: StableSliceId,
  ): LineageId {
    const lineageId = state.spec.stableToLineage[stableSliceId];

    assertNotUndefined(
      lineageId,
      `Slice "${stableSliceId}" not found in store`,
    );
    return lineageId;
  }
  static getSlice(
    state: StoreState<any>,
    lineageId: LineageId,
  ): UnknownSlice | undefined {
    return state.spec.lookupByLineage[lineageId];
  }
  static getSlices(storeState: StoreState<any>): UnknownSlice[] {
    return storeState.spec.slices;
  }

  static getSliceState(storeState: StoreState<any>, _sl: AnySlice): unknown {
    const sl = storeState.spec.lookupByLineage[_sl.spec.lineageId];

    if (!sl) {
      throw new Error(`Slice "${_sl.spec.name}" not found in store`);
    }

    const scopeId = storeState.config.scope;

    if (scopeId && scopeId !== _sl.spec.lineageId) {
      const scopedSlice = storeState.spec.lookupByLineage[scopeId];

      if (
        !scopedSlice ||
        // TODO make this deep dependency lookup? this is because they can in theory pass it around
        // so in theory a deep dependency lookup is what we want.
        !sliceDepLineageLookup(scopedSlice).has(_sl.spec.lineageId)
      ) {
        throw new Error(
          `Slice "${sl.spec.name}" is not included in the dependencies of the scoped slice "${scopedSlice?.spec.name}"`,
        );
      }
    }

    let result = storeState._getDirectSliceState(sl.spec.lineageId);
    if (!result.found) {
      throw new Error(
        `Slice "${sl.spec.name}" "${sl.spec.lineageId}" not found in store`,
      );
    }

    return result.value;
  }

  static getStableSliceId(
    state: StoreState<any>,
    lineageId: LineageId,
  ): StableSliceId {
    const sliceId = state.spec.lineageToStable[lineageId];
    assertNotUndefined(sliceId, `Slice "${lineageId}" not found in store`);

    return sliceId;
  }

  // scope the state to be only accessed by a specific slice
  // and its dependencies
  static scoped<N extends string = any>(
    store: StoreState<N>,
    lineageId: LineageId,
  ): StoreState<N> {
    return StoreState._fork(store, undefined, {
      scope: lineageId,
    });
  }

  protected slicesCurrentState: Record<LineageId, unknown> =
    Object.create(null);

  constructor(
    protected readonly spec: InputStoreStateSpec<TSliceName>,
    protected readonly config: StoreStateConfig,
  ) {}

  applyTransaction(
    tx: Transaction<TSliceName, unknown[]>,
  ): StoreState<TSliceName> {
    const newState = { ...this.slicesCurrentState };
    const newStoreState = StoreState._fork(this, newState);

    let found = false;

    for (const slice of this.spec.slices) {
      if (slice.spec.lineageId === tx.targetSliceLineage) {
        found = true;

        const sliceState = newStoreState._getDirectSliceState(
          slice.spec.lineageId,
        );

        if (!sliceState.found) {
          throw new Error(
            `Slice "${slice.spec.lineageId}" or one of its dependencies not found in store`,
          );
        }

        newState[slice.spec.lineageId] = slice.applyTx(
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

  /**
   * @internal
   */
  static _fork(
    state: StoreState<any>,
    slicesState: Record<string, unknown> = state.slicesCurrentState,
    config?: Partial<StoreStateConfig>,
  ): StoreState<any> {
    const newConfig = config ? { ...state.config, ...config } : state.config;
    const newInstance = new StoreState(state.spec, newConfig);
    newInstance.slicesCurrentState = slicesState;
    return newInstance;
  }

  private _getDirectSliceState(lineageId: LineageId) {
    if (
      // TODO maybe we can improve the performance here
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
