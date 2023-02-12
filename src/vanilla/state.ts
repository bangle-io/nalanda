import { findDuplications } from './helpers';
import { KeyMapping } from './merge';
import { BareSlice } from './slice';
import { Transaction } from './transaction';

export type ResolveSliceIfRegistered<
  SL extends BareSlice,
  SliceRegistry extends BareSlice,
> = SL extends BareSlice<infer K, any>
  ? K extends SliceRegistry['key']
    ? SL
    : never
  : never;

export interface StoreState<RegSlices extends BareSlice> {
  getSliceState<SL extends BareSlice>(
    slice: ResolveSliceIfRegistered<SL, RegSlices>,
  ): SL['initState'];

  applyTransaction(
    tx: Transaction<RegSlices['key'], unknown[]>,
  ): StoreState<RegSlices>;
}

interface StoreStateOptions {
  debug?: boolean;
  keyMapping?: KeyMapping | undefined;
}

export class InternalStoreState implements StoreState<any> {
  protected slicesCurrentState: Record<string, unknown> = Object.create(null);

  static create<SL extends BareSlice>(slices: SL[]): StoreState<SL> {
    InternalStoreState.checkUniqueKeys(slices);
    InternalStoreState.circularCheck(slices);
    InternalStoreState.checkDependencyOrder(slices);

    const instance = new InternalStoreState(slices);

    for (const slice of slices) {
      instance.slicesCurrentState[slice.key] = slice.initState;
    }

    return instance;
  }

  constructor(
    public readonly _slices: BareSlice[],
    public opts?: StoreStateOptions,
  ) {}

  applyTransaction(tx: Transaction<string, unknown[]>): InternalStoreState {
    const newState = { ...this.slicesCurrentState };
    const newStoreState = this._fork(newState);

    let found = false;

    for (const slice of this._slices) {
      if (slice.key === tx.sliceKey) {
        found = true;

        const sliceState = newStoreState._getDirectSliceState(slice.key);

        if (!sliceState.found) {
          throw new Error(
            `Slice "${slice.key}" or one of its dependencies not found in store`,
          );
        }

        const scopedStoreState = newStoreState._withKeyMapping(
          slice._bare.keyMapping,
        );

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

  getSliceState(sl: BareSlice): unknown {
    debugger;
    let result = this._getDirectSliceState(sl.key);
    if (!result.found) {
      throw new Error(`Slice "${sl.key}" not found in store`);
    }
    return result.value;
  }

  private _getDirectSliceState(key: string) {
    if (this.opts?.keyMapping) {
      const mappedKey = this.opts.keyMapping.get(key);
      if (mappedKey === undefined) {
        throw new Error(
          `Key "${key}" not found in keyMapping. Did you forget to add it as a dependency it?`,
        );
      }
      console.debug(`Augmented key "${key}" to "${mappedKey}`);
      key = mappedKey;
    }

    if (Object.prototype.hasOwnProperty.call(this.slicesCurrentState, key)) {
      return {
        found: true,
        value: this.slicesCurrentState[key]!,
      };
    }

    return { found: false, value: undefined };
  }

  _withKeyMapping(keyMapping?: KeyMapping) {
    return this._fork(this.slicesCurrentState, { keyMapping });
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

  static checkDependencyOrder(slices: BareSlice[]) {
    let seenKeys = new Set<string>();
    for (const slice of slices) {
      const { dependencies } = slice.config;

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

      for (const dep of slice.config.dependencies) {
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
