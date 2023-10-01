import type { FieldState, Slice } from './slice';
import { SliceId } from './types';
import { throwValidationError } from './helpers/throw-error';
import { Transaction } from './transaction';

interface StoreStateOpts {
  slices: Slice[];
  sliceStateMap: Record<SliceId, SliceStateManager>;
}

export class StoreState {
  static create(options: { slices: Slice[] }) {
    const sliceStateMap: Record<SliceId, SliceStateManager> =
      Object.fromEntries(
        options.slices.map((slice) => [
          slice.sliceId,
          SliceStateManager.new(slice),
        ]),
      );

    return new StoreState({
      slices: options.slices,
      sliceStateMap,
    });
  }
  constructor(private options: StoreStateOpts) {}

  _getSliceStateManager(slice: Slice): SliceStateManager {
    const stateMap = this.options.sliceStateMap[slice.sliceId];

    if (!stateMap) {
      throwValidationError(
        `Slice "${slice.name}" does not exist, did you forget to add it to the store?`,
      );
    }
    return stateMap;
  }

  _updateSliceStateManager(
    slice: Slice,
    sliceStateManager: SliceStateManager,
  ): StoreState {
    const sliceStateMap = {
      ...this.options.sliceStateMap,
      [slice.sliceId]: sliceStateManager,
    };
    return new StoreState({
      ...this.options,
      sliceStateMap,
    });
  }

  apply(transaction: Transaction): StoreState {
    if (transaction._isConsumed()) {
      throwValidationError(
        `Transaction "${transaction.id}" has already been applied.`,
      );
    }

    const steps = transaction._getSteps();
    transaction._markConsumed();

    return steps.reduce((storeState, step) => {
      return step.cb(storeState);
    }, this as StoreState);
  }
}

class SliceStateManager {
  static new(slice: Slice) {
    return new SliceStateManager(slice, slice.initialValue);
  }

  constructor(
    public readonly slice: Slice,
    public readonly sliceState: Record<string, unknown>,
  ) {}

  _getFieldState(field: FieldState): unknown {
    const fieldState = this.sliceState[field._fieldId!];
    return fieldState;
  }

  _updateFieldState(field: FieldState, updater: any): SliceStateManager {
    const oldValue = this._getFieldState(field);
    const newValue =
      typeof updater === 'function' ? updater(oldValue) : updater;

    if (field.isEqual(oldValue, newValue)) {
      return this;
    }

    return new SliceStateManager(this.slice, {
      ...this.sliceState,
      [field._fieldId!]: newValue,
    });
  }
}
