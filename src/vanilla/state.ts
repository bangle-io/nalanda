import { coreReadySlice } from './core-effects';
import { findDuplications, weakCache } from './helpers';
import { SliceContext, SliceKey } from './internal-types';
import { BareSlice } from './slice';
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

  static create<SL extends BareSlice>(_slices: SL[]): StoreState<SL> {
    const slices = _slices.flatMap((slice) => {
      return [...(slice.spec._additionalSlices || []), slice];
    });

    if (!slices.find((s) => s.key === coreReadySlice.key)) {
      slices.unshift(coreReadySlice);
    }

    const instance = new InternalStoreState(slices);

    for (const slice of slices) {
      instance.slicesCurrentState[slice.key] = slice.initState;
    }

    return instance;
  }

  constructor(
    public readonly _slices: BareSlice[],
    public opts?: StoreStateOptions,
  ) {
    InternalStoreState.checkUniqueKeys(_slices);
    InternalStoreState.checkUniqDependency(_slices);
    InternalStoreState.circularCheck(_slices);
    InternalStoreState.checkDependencyOrder(_slices);

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

  // TODO add test
  static checkUniqDependency(slices: BareSlice[]) {
    for (const slice of slices) {
      const dependencies = slice.spec.dependencies;
      if (
        new Set(dependencies.map((d) => d.key)).size !== dependencies.length
      ) {
        throw new Error(
          `Slice "${slice.key}" has duplicate dependencies: ${dependencies
            .map((d) => d.key)
            .join(', ')}`,
        );
      }
    }
  }

  static checkDependencyOrder(slices: BareSlice[]) {
    let seenKeys = new Set<string>();
    for (const slice of slices) {
      const dependencies = slice.spec.dependencies;
      if (dependencies !== undefined) {
        const depKeys = dependencies.map((d) => d.key);
        for (const depKey of depKeys) {
          if (!seenKeys.has(depKey)) {
            throw new Error(
              `Slice "${slice.key}" has a dependency on Slice "${depKey}" which is either not registered or is registered after this slice.`,
            );
          }
        }
      }
      seenKeys.add(slice.key);
    }
  }

  static checkUniqueKeys(slices: BareSlice[]) {
    const keys = slices.map((s) => s.key);
    const unique = new Set(keys);

    if (keys.length !== unique.size) {
      const dups = findDuplications(keys);
      throw new Error('Duplicate slice keys ' + dups.join(', '));
    }
  }

  static circularCheck(slices: BareSlice[]) {
    const stack = new Set<string>();
    const visited = new Set<string>();

    const checkCycle = (slice: BareSlice): boolean => {
      const key = slice.key;
      if (stack.has(key)) return true;
      if (visited.has(key)) return false;

      visited.add(key);
      stack.add(key);

      for (const dep of slice.spec.dependencies) {
        if (checkCycle(dep)) {
          return true;
        }
      }
      stack.delete(key);
      return false;
    };

    for (const slice of slices) {
      const cycle = checkCycle(slice);
      if (cycle) {
        const path = [...stack];
        path.push(slice.key);

        throw new Error(
          `Circular dependency detected in slice "${
            slice.key
          }" with path ${path.join(' ->')}`,
        );
      }
    }
  }
}
