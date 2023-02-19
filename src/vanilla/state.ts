import { coreReadySlice } from './core-effects';
import { findDuplications } from './helpers';
import { BareSlice } from './slice';
import { Transaction } from './transaction';

export type KeyMapping = (key: string) => string;

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
  keyMapping?: KeyMapping;
}

export class InternalStoreState implements StoreState<any> {
  protected slicesCurrentState: Record<string, unknown> = Object.create(null);

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
  }

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
          slice.keyMapping.bind(slice),
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
    let result = this._getDirectSliceState(sl.key);
    if (!result.found) {
      throw new Error(`Slice "${sl.key}" not found in store`);
    }
    return result.value;
  }

  private _getDirectSliceState(key: string) {
    if (this.opts?.keyMapping) {
      const mappedKey = this.opts.keyMapping(key);
      if (mappedKey === undefined) {
        throw new Error(
          `Key "${key}" not found in keyMapping. Did you forget to add it as a dependency it?`,
        );
      }
      // console.debug(`Augmented key "${key}" to "${mappedKey}`);
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
    if (keyMapping) {
      return this._fork(this.slicesCurrentState, { keyMapping });
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
