import { assertNotUndefined, weakCache } from './helpers';
import type {
  UnknownSlice,
  AnySliceWithName,
  UnknownSliceWithName,
  AnySlice,
  Slice,
} from './slice';
import {
  ExpandSlice,
  expandSlices,
  validatePathMap,
  createSliceLineageLookup,
  validateSlices,
  flattenReverseDependencies,
  calcReverseDependencies,
} from './slices-helpers';
import type { Transaction } from './transaction';
import type { DerivedStateFn, LineageId, StableSliceId } from './types';

interface InputStoreStateSpec<TSliceName extends string> {
  readonly slices: UnknownSliceWithName<TSliceName>[];
  readonly stableToLineage: Record<StableSliceId, LineageId>;
  readonly lineageToStable: Record<LineageId, StableSliceId>;
  readonly lookupByLineage: Record<LineageId, UnknownSlice>;
  readonly deriveStateFuncs: Record<
    LineageId,
    ReturnType<DerivedStateFn<TSliceName, unknown, any, any>>
  >;
  readonly reverseDeps: Record<LineageId, Set<LineageId>>;
}

interface CurrentState {
  slices: Record<LineageId, unknown>;
  change: Record<LineageId, symbol>;
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

    const deriveStateFuncs: InputStoreStateSpec<any>['deriveStateFuncs'] =
      Object.create(null);

    const instance = new StoreState(
      {
        slices,
        lineageToStable: pathMap,
        stableToLineage: reversePathMap,
        lookupByLineage: createSliceLineageLookup(slices),
        deriveStateFuncs: deriveStateFuncs,
        reverseDeps: flattenReverseDependencies(
          calcReverseDependencies(slices),
        ),
      },
      {},
    );

    for (const slice of slices) {
      instance.currentState.slices[slice.spec.lineageId] = slice.spec.initState;
      instance.currentState.change[slice.spec.lineageId] = Symbol();
    }

    // setup override of initial state
    if (initStateOverride) {
      const overriddenSlices = new Set<string>(Object.keys(initStateOverride));
      for (const slice of slices) {
        if (initStateOverride[slice.spec.lineageId] !== undefined) {
          instance.currentState.slices[slice.spec.lineageId] =
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

    // initialize derived state
    for (const slice of slices) {
      deriveStateFuncs[slice.spec.lineageId] = slice.spec.derivedState(
        instance,
        slice as Slice<any, any, any, never>,
      );
    }

    return instance;
  }

  // TODO improve this as it is running on every call, we dont need to
  static getDerivedState(storeState: StoreState<any>, _sl: AnySlice): unknown {
    const func = storeState.spec.deriveStateFuncs[_sl.spec.lineageId]!;
    return func(_sl.getState(storeState), storeState);
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

  static getChangeRef(storeState: StoreState<any>, _sl: AnySlice): symbol {
    return storeState.currentState.change[_sl.spec.lineageId]!;
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
        // TODO we need to test this case
        !storeState.spec.reverseDeps[_sl.spec.lineageId]?.has(
          scopedSlice.spec.lineageId,
        )
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

  protected currentState: CurrentState = {
    slices: Object.create(null),
    change: Object.create(null),
  };

  constructor(
    protected readonly spec: InputStoreStateSpec<TSliceName>,
    protected readonly config: StoreStateConfig,
  ) {}

  protected cloneCurrentState(): CurrentState {
    return {
      slices: { ...this.currentState.slices },
      change: { ...this.currentState.change },
    };
  }

  applyTransaction(
    tx: Transaction<TSliceName, unknown[]>,
  ): StoreState<TSliceName> {
    const newState = this.cloneCurrentState();

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

        newState.slices[slice.spec.lineageId] = slice.applyTx(
          sliceState.value,
          newStoreState,
          tx,
        );

        newState.change[slice.spec.lineageId] = Symbol();

        this.spec.reverseDeps[slice.spec.lineageId]?.forEach((dep) => {
          newState.change[dep] = Symbol();
        });

        break;
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
    currentState: CurrentState = state.currentState,
    config?: Partial<StoreStateConfig>,
  ): StoreState<any> {
    const newConfig = config ? { ...state.config, ...config } : state.config;
    const newInstance = new StoreState(state.spec, newConfig);
    newInstance.currentState = currentState;
    return newInstance;
  }

  private _getDirectSliceState(lineageId: LineageId) {
    if (
      // TODO maybe we can improve the performance here
      Object.prototype.hasOwnProperty.call(this.currentState.slices, lineageId)
    ) {
      return {
        found: true,
        value: this.currentState.slices[lineageId]!,
      };
    }

    return { found: false, value: undefined };
  }
}
