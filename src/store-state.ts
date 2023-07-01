import { Action } from './action';
import type { SliceId } from './types';
import type { Slice } from './slice';
import type { Step, Transaction } from './transaction';
import { validateSlices } from './helpers';

type StoreStateOpts<TSliceName extends string> = {
  stateOverride?: Record<SliceId, unknown>;
  slices: Slice<TSliceName, any, any>[];
};

// meant to be used internally
type StoreStateConfig<TSliceName extends string> =
  StoreStateOpts<TSliceName> & {
    slicesLookup: Record<SliceId, Slice<TSliceName, any, any>>;
  };

function computeConfig<TSliceName extends string>(
  opts: StoreStateOpts<TSliceName>,
): StoreStateConfig<TSliceName> {
  const lookup: Record<SliceId, Slice<any, any, any>> = Object.fromEntries(
    opts.slices.map((slice) => [slice.sliceId, slice]),
  );

  return {
    ...opts,
    slicesLookup: lookup,
  };
}

export class SliceStateManager {
  constructor(
    public readonly sliceId: SliceId,
    public readonly sliceState: unknown,
  ) {}

  applyStep(
    step: Step<any, any>,
    storeState: StoreState<any>,
  ): SliceStateManager {
    const newSliceState = Action._applyStep(storeState, step);

    if (this.sliceState === newSliceState) {
      return this;
    }

    return new SliceStateManager(step.targetSliceId, newSliceState);
  }
}

export class StoreState<TSliceName extends string> {
  static create<TSliceName extends string>(opts: StoreStateOpts<TSliceName>) {
    validateSlices(opts.slices);

    const sliceStateMap: Record<SliceId, SliceStateManager> =
      Object.create(null);

    for (const slice of opts.slices) {
      sliceStateMap[slice.sliceId] = new SliceStateManager(
        slice.sliceId,
        slice.initialState,
      );
    }

    if (opts.stateOverride) {
      for (const [sliceId, override] of Object.entries(opts.stateOverride)) {
        const id = sliceId as SliceId;
        if (!sliceStateMap[id]) {
          throw new Error(
            `StoreState.create: slice with id "${id}" does not exist`,
          );
        }
        sliceStateMap[id] = new SliceStateManager(id, override);
      }
    }

    return new StoreState(sliceStateMap, computeConfig(opts));
  }

  /**
   * @internal
   */
  getSliceStateManager(sliceId: SliceId): SliceStateManager {
    const match = this.sliceStateMap[sliceId];

    if (match === undefined) {
      throw new Error(
        `StoreState.resolveSliceState: slice with id "${sliceId}" does not exist`,
      );
    }

    return match;
  }

  applyTransaction(txn: Transaction<any>): StoreState<TSliceName> {
    if (txn.isDestroyed) {
      throw new Error(
        `StoreState.applyTransaction: cannot apply a destroyed transaction`,
      );
    }

    let storeState: StoreState<any> = this;

    // we want each step to get the updated storeState
    for (const step of txn.steps) {
      storeState = storeState.applyStep(step);
    }

    return storeState;
  }

  private applyStep(step: Step<any, any>): StoreState<any> {
    const sliceId = step.targetSliceId;
    const oldManager = this.getSliceStateManager(sliceId);
    const newManager = oldManager.applyStep(step, this);

    if (newManager === oldManager) {
      return this;
    }

    const sliceStateMap = { ...this.sliceStateMap };
    sliceStateMap[sliceId] = newManager;
    return new StoreState(sliceStateMap, this.config);
  }

  private constructor(
    private sliceStateMap: Record<SliceId, SliceStateManager> = Object.create(
      null,
    ),
    protected config: StoreStateConfig<TSliceName>,
  ) {}
}
