import type { BaseField } from '../slice/field';
import type { Slice } from '../slice/slice';
import type { Store } from '../store';
import type { StoreState } from '../store-state';
import { FieldTracker } from './types';

// find out what field changed
export function whatFieldChanged(
  state: StoreState<any>,
  fieldTrackers: ReadonlyArray<FieldTracker>,
):
  | {
      field: BaseField<any>;
      newVal: unknown;
      oldVal: unknown;
    }
  | undefined {
  for (const { field, value } of fieldTrackers) {
    const newVal = field.get(state);

    if (!field.isEqual(newVal, value)) {
      return { field, newVal, oldVal: value };
    }
  }

  return undefined;
}

/**
 * Tells whether the field trackers track any of the slices provided
 * @param slices
 * @param fieldTrackers
 * @returns
 */
export function doesTrackSlice(
  slices: ReadonlySet<Slice>,
  fieldTrackers: ReadonlyArray<FieldTracker>,
) {
  for (const { field } of fieldTrackers) {
    const parentSlice = field._getSlice();
    if (slices.has(parentSlice)) {
      return true;
    }
  }
  return false;
}

export function calculateSlicesChanged({
  newState,
  oldState,
  storeComputed,
}: {
  newState: StoreState<any>;
  oldState: StoreState<any>;
  storeComputed: Store<any>['_computed'];
}): ReadonlySet<Slice> {
  const slicesChanged = new Set<Slice>();

  storeComputed.allSlices.forEach((slice) => {
    if (slicesChanged.has(slice)) {
      return;
    }
    if (newState._didSliceStateChange(slice, oldState)) {
      slicesChanged.add(slice);

      // also add all slices that depend on this slice, so that derived state can be recalculated
      storeComputed.reverseAllDependencies[slice.sliceId]?.forEach(
        (dependentSlice) => {
          // TODO we can add a check here on _didSliceStateChange to avoid adding slices that didn't change
          // but I am not sure if it's worth the optimization - since there are
          // additional checks on the effect side as well.
          slicesChanged.add(dependentSlice);
        },
      );
    }
  });

  return slicesChanged;
}
