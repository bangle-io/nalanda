import { weakCache } from './helpers';
import { SliceContext, SliceKey } from './internal-types';
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

  context: SliceContext | undefined;
}

interface StoreStateOptions {
  debug?: boolean;
  context?: SliceContext;
}

export type SliceLookupByKey = Record<SliceKey, BareSlice>;

const createSliceLookup = weakCache((slices: BareSlice[]) => {
  return Object.fromEntries(slices.map((s) => [s.key, s]));
});

export class InternalStoreState implements StoreState<any> {
  public readonly context: SliceContext | undefined;

  protected slicesCurrentState: Record<SliceKey, unknown> = Object.create(null);

  public readonly sliceLookupByKey: SliceLookupByKey;

  static create<SL extends BareSlice>(slices: SL[]): StoreState<SL> {
    validateSlices(slices);

    const instance = new InternalStoreState(slices);

    // initialize state
    for (const slice of slices) {
      instance.slicesCurrentState[slice.key] = slice.initState;
    }

    return instance;
  }

  constructor(
    public readonly _slices: BareSlice[],
    public opts?: StoreStateOptions,
  ) {
    this.context = opts?.context;
    this.sliceLookupByKey = createSliceLookup(_slices);
  }

  applyTransaction(tx: Transaction<string, unknown[]>): InternalStoreState {
    const newState = { ...this.slicesCurrentState };
    const newStoreState = this._fork(newState);

    let found = false;

    for (const slice of this._slices) {
      if (slice.key === tx.targetSliceKey) {
        found = true;

        const sliceState = newStoreState._getDirectSliceState(slice.key);

        if (!sliceState.found) {
          throw new Error(
            `Slice "${slice.key}" or one of its dependencies not found in store`,
          );
        }

        const scopedStoreState = newStoreState._withContext({
          sliceKey: slice.key,
        });

        newState[slice.key] = slice.applyTx(
          sliceState.value,
          scopedStoreState,
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
  getSliceState(sl: BareSlice): unknown {
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

  _withContext(context?: SliceContext) {
    if (context) {
      return this._fork(this.slicesCurrentState, { context });
    }

    return this;
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
}
