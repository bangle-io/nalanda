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

export interface StoreState<RegSlices extends BareSlice> {
  getSliceState<SL extends BareSlice>(
    slice: ResolveSliceIfRegistered<SL, RegSlices>,
  ): SL['initState'];

  applyTransaction(
    tx: Transaction<RegSlices['name'], unknown[]>,
  ): StoreState<RegSlices>;
}

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

export class InternalStoreState implements StoreState<any> {
  protected slicesCurrentState: Record<SliceKey, unknown> = Object.create(null);

  public readonly sliceLookupByKey: SliceLookupByKey;
  public readonly slicesLookupByLineage: SliceLookupByLineage;

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

    const instance = new InternalStoreState(slices);

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

  constructor(
    public readonly _slices: BareSlice[],
    public opts?: StoreStateOptions,
  ) {
    this.sliceLookupByKey = createSliceLookup(_slices);
    this.slicesLookupByLineage = createSliceLineageLookup(_slices);
  }

  applyTransaction(tx: Transaction<string, unknown[]>): InternalStoreState {
    const newState = { ...this.slicesCurrentState };
    const newStoreState = this._fork(newState);

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

  // TODO make sure this works with mapping keys
  getSliceState(_sl: BareSlice): unknown {
    const sl = this.slicesLookupByLineage[_sl.lineageId];

    if (!sl) {
      throw new Error(`Slice "${_sl.name}" not found in store`);
    }

    const scopeId = this.opts?.scoped;
    if (scopeId && scopeId !== _sl.lineageId) {
      const scopedSlice = this.slicesLookupByLineage[scopeId];

      if (
        !scopedSlice ||
        !sliceDepLineageLookup(scopedSlice).has(_sl.lineageId)
      ) {
        throw new Error(
          `Slice "${sl.name}" is not included in the dependencies of the scoped slice "${scopedSlice?.name}"`,
        );
      }
    }

    let result = this._getDirectSliceState(sl.key);
    if (!result.found) {
      throw new Error(`Slice "${sl.key}" not found in store`);
    }
    return result.value;
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

  private _fork(
    slicesState: Record<string, unknown>,
    opts?: Partial<StoreStateOptions>,
  ): InternalStoreState {
    const newOpts = !opts
      ? this.opts
      : {
          ...this.opts,
          ...opts,
        };

    const newInstance = new InternalStoreState(this._slices, newOpts);
    newInstance.slicesCurrentState = slicesState;
    return newInstance;
  }

  scoped(lineageId: LineageId): InternalStoreState {
    return this._fork(this.slicesCurrentState, {
      ...this.opts,
      scoped: lineageId,
    });
  }
}
