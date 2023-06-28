import { Action } from './action';
import type { SliceId } from './helpers';
import type { Slice } from './slice';
import type { Step, Transaction } from './transaction';
import { validateSlices } from './validations';

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

export class SliceState {
  constructor(
    public readonly sliceId: SliceId,
    public readonly userState: unknown,
  ) {}
}

export class StoreState<TSliceName extends string> {
  static create<TSliceName extends string>(opts: StoreStateOpts<TSliceName>) {
    validateSlices(opts.slices);

    const sliceStateMap: Record<SliceId, SliceState> = Object.create(null);

    for (const slice of opts.slices) {
      sliceStateMap[slice.sliceId] = new SliceState(
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
        sliceStateMap[id] = new SliceState(id, override);
      }
    }

    return new StoreState(sliceStateMap, computeConfig(opts));
  }

  getSliceState(sliceId: SliceId): SliceState {
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
    const result = Action._applyStep(this, step);

    if (result === this.getSliceState(step.targetSliceId)) {
      return this;
    }

    const sliceStateMap = { ...this.sliceStateMap };
    sliceStateMap[result.sliceId] = result;
    return new StoreState(sliceStateMap, this.config);
  }

  private constructor(
    private sliceStateMap: Record<SliceId, SliceState> = Object.create(null),
    protected config: StoreStateConfig<TSliceName>,
  ) {}
}
