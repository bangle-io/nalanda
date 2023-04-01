import { weakCache } from './helpers';
import { LineageId, SliceKey } from './internal-types';
import { BareSlice } from './slice';
import { validateSlices } from './slices-helpers';
import { Transaction } from './transaction';

export type ResolveSliceIfRegistered<
  SL extends BareSlice,
  SliceRegistry extends BareSlice,
> = SL extends BareSlice<infer N, any>
  ? N extends SliceRegistry['name']
    ? SL
    : never
  : never;

interface StoreStateOptions {
  debug?: boolean;
  scoped?: LineageId;
}

export type SliceLookupByKey = Record<SliceKey, BareSlice>;
export type SliceLookupByLineage = Record<LineageId, BareSlice>;

const createSliceLookup = weakCache((slices: BareSlice[]) => {
  return Object.fromEntries(slices.map((s) => [s.key, s]));
});
const createSliceLineageLookup = weakCache(
  (slices: BareSlice[]): SliceLookupByLineage => {
    return Object.fromEntries(slices.map((s) => [s.lineageId, s]));
  },
);

export const sliceDepLineageLookup = weakCache(
  (slice: BareSlice): Set<LineageId> => {
    return new Set(slice.spec.dependencies.map((sl) => sl.lineageId));
  },
);

export class StoreState<RegSlices extends BareSlice = any> {
  /**
   *
   * @param slices - the slices to use to create the store state
   * @param initStateOverride - optional state to override the initial state of the slices
   *                          Note! that this is a record of slice name and not slice key.
   *                          If there are multiple slices with the same name, all of them will be overridden.
   * @returns
   */
  static create<SL extends BareSlice>(
    slices: SL[],
    // TODO make this more precise by using lineageId or key
    initStateOverride?: Record<string, unknown>,
  ): StoreState<SL> {
    validateSlices(slices);

    const instance = new StoreState(slices);

    for (const slice of slices) {
      instance.slicesCurrentState[slice.key] = slice.initState;
    }

    if (initStateOverride) {
      const overriddenSlices = new Set<string>(Object.keys(initStateOverride));
      for (const slice of slices) {
        if (
          Object.prototype.hasOwnProperty.call(initStateOverride, slice.name)
        ) {
          instance.slicesCurrentState[slice.key] =
            initStateOverride[slice.name];

          overriddenSlices.delete(slice.name);
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

  static fork(
    store: StoreState,
    slicesState: Record<string, unknown> = store.slicesCurrentState,
    opts: (opts: StoreStateOptions) => StoreStateOptions = (opts) => opts,
  ): StoreState {
    const newOpts = opts(store.opts || {});
    const newInstance = new StoreState(store._slices, newOpts);
    newInstance.slicesCurrentState = slicesState;
    return newInstance;
  }

  static scoped(store: StoreState, lineageId: LineageId): StoreState {
    return StoreState.fork(store, undefined, (opts) => ({
      ...opts,
      scoped: lineageId,
    }));
  }

  static getSliceState(storeState: StoreState<any>, _sl: BareSlice): unknown {
    const sl = storeState.slicesLookupByLineage[_sl.lineageId];

    if (!sl) {
      throw new Error(`Slice "${_sl.name}" not found in store`);
    }

    const scopeId = storeState.opts?.scoped;
    if (scopeId && scopeId !== _sl.lineageId) {
      const scopedSlice = storeState.slicesLookupByLineage[scopeId];

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

    let result = storeState._getDirectSliceState(sl.key);
    if (!result.found) {
      throw new Error(`Slice "${sl.key}" not found in store`);
    }
    return result.value;
  }

  static getSlices(storeState: StoreState<any>): BareSlice[] {
    return storeState._slices;
  }

  protected slicesCurrentState: Record<SliceKey, unknown> = Object.create(null);

  public readonly sliceLookupByKey: SliceLookupByKey;
  public readonly slicesLookupByLineage: SliceLookupByLineage;

  constructor(
    protected readonly _slices: BareSlice[],
    public opts?: StoreStateOptions,
  ) {
    this.sliceLookupByKey = createSliceLookup(_slices);
    this.slicesLookupByLineage = createSliceLineageLookup(_slices);
  }

  applyTransaction(
    tx: Transaction<RegSlices['name'], unknown[]>,
  ): StoreState<RegSlices> {
    const newState = { ...this.slicesCurrentState };
    const newStoreState = StoreState.fork(this, newState);

    let found = false;

    for (const slice of this._slices) {
      if (slice.lineageId === tx.targetSliceLineage) {
        found = true;

        const sliceState = newStoreState._getDirectSliceState(slice.key);

        if (!sliceState.found) {
          throw new Error(
            `Slice "${slice.lineageId}" or one of its dependencies not found in store`,
          );
        }

        newState[slice.key] = slice.applyTx(
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

  private _getDirectSliceState(key: SliceKey) {
    if (Object.prototype.hasOwnProperty.call(this.slicesCurrentState, key)) {
      return {
        found: true,
        value: this.slicesCurrentState[key]!,
      };
    }

    return { found: false, value: undefined };
  }
}
