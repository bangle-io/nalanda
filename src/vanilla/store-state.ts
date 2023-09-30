import type { Slice } from './slice';
import { SliceId } from './types';
import { throwValidationError } from './helpers/throw-error';

interface StoreStateOpts {
  slices: Slice[];
  sliceStateMap: Record<SliceId, SliceStateManager>;
}

export class StoreState {
  static create(options: { slices: Slice[] }) {
    //  validateSlices(opts.slices);

    const sliceStateMap: Record<SliceId, SliceStateManager> =
      Object.fromEntries(
        options.slices.map((slice) => [
          slice.sliceId,
          new SliceStateManager(slice, slice.initialState),
        ]),
      );

    return new StoreState({
      slices: options.slices,
      sliceStateMap,
    });
  }
  constructor(private options: StoreStateOpts) {}

  _getSliceState(slice: Slice): Record<string, unknown> {
    const stateMap = this.options.sliceStateMap[slice.sliceId];

    if (!stateMap) {
      throwValidationError(
        `Slice "${slice.name}" does not exist, did you forget to add it to the store?`,
      );
    }
    return stateMap.sliceState;
  }
}

class SliceStateManager {
  constructor(
    public readonly slice: Slice,
    public readonly sliceState: Record<string, unknown>,
  ) {}
}
