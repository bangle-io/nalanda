import type { Slice } from './slice/slice';
import { FieldId, SliceId } from './types';
import { throwValidationError } from './helpers/throw-error';
import { Transaction } from './transaction';
import { calcReverseDependencies } from './helpers/dependency-helpers';
import { StateField } from './slice/field';
import { validateSlices } from './helpers/validations';

type SliceStateMap = Record<SliceId, SliceStateManager>;

interface StoreStateConfig {
  slices: Slice[];
  sliceStateMap: SliceStateMap;
  computed: {
    slicesLookup: Record<SliceId, Slice>;
    reverseSliceDependencies: Record<SliceId, Set<SliceId>>;
  };
  /**
   * A store state when updated will share the same ref object as the older one.
   * Use to store values that should persist between store state updates, but without
   * needed to couple with Store.
   */
  lineageRef: { current: null };
}

function slicesComputedInfo(options: {
  slices: Slice[];
}): StoreStateConfig['computed'] {
  const slicesLookup = Object.fromEntries(
    options.slices.map((slice) => [slice.sliceId, slice]),
  );

  return {
    slicesLookup,
    reverseSliceDependencies: calcReverseDependencies(options.slices),
  };
}

export class StoreState<TSliceName extends string> {
  static create<TSliceName extends string>(options: {
    slices: Slice<any, TSliceName, any>[];
    stateOverride?: Record<SliceId, Record<string, unknown>>;
  }): StoreState<TSliceName> {
    validateSlices(options.slices);

    const sliceStateMap: SliceStateMap = Object.fromEntries(
      options.slices.map((slice) => [
        slice.sliceId,
        SliceStateManager._new(slice),
      ]),
    );

    const computed = slicesComputedInfo(options);

    if (options.stateOverride) {
      for (const [sliceId, override] of Object.entries(options.stateOverride)) {
        const id = sliceId as SliceId;

        if (!sliceStateMap[id]) {
          throwValidationError(
            `StoreState.create: slice with id "${id}" does not exist`,
          );
        }

        const slice = computed.slicesLookup[id]!;

        sliceStateMap[id] = SliceStateManager._new(slice, override);
      }
    }

    const ref = { current: null };

    return new StoreState({
      slices: options.slices,
      sliceStateMap,
      computed,
      lineageRef: ref,
    });
  }

  protected constructor(
    // @internal
    private config: StoreStateConfig,
  ) {}

  // TODO: add strict type checking to Txn.
  apply(transaction: Transaction<any, any>): StoreState<TSliceName> {
    if (transaction._isDestroyed()) {
      throwValidationError(
        `Transaction "${transaction.id}" has already been applied.`,
      );
    }

    const steps = transaction._getSteps();
    transaction._destroy();

    return steps.reduce((storeState, step) => {
      return step.stepper(storeState);
    }, this as StoreState<TSliceName>);
  }

  // @internal
  _getSliceStateManager(slice: Slice): SliceStateManager {
    const stateMap = this.config.sliceStateMap[slice.sliceId];

    if (!stateMap) {
      throwValidationError(
        `Slice "${slice.name}" does not exist, did you forget to add it to the store?`,
      );
    }
    return stateMap;
  }

  // @internal
  _updateSliceStateManager(
    slice: Slice,
    sliceStateManager: SliceStateManager,
  ): StoreState<any> {
    const sliceStateMap = {
      ...this.config.sliceStateMap,
      [slice.sliceId]: sliceStateManager,
    };
    return new StoreState({
      ...this.config,
      sliceStateMap,
    });
  }

  // Checks if the state of a slice has changed compared to the provided store state.
  // ! Doesn't account for derived state changes.
  // ! Doesn't account for any addition or removal of slices.
  // @internal
  _didSliceStateChange(
    slice: Slice,
    otherStoreState: StoreState<any>,
  ): boolean {
    const sliceStateManager = this._getSliceStateManager(slice);
    const otherSliceStateManager = otherStoreState._getSliceStateManager(slice);

    // just comparing state managers is good enough, as they are immutable.
    return sliceStateManager !== otherSliceStateManager;
  }

  // @internal
  get _ref() {
    return this.config.lineageRef;
  }
}

export class SliceStateManager {
  // @internal
  static _new(slice: Slice, sliceStateOverride?: Record<string, unknown>) {
    if (sliceStateOverride) {
      slice._verifyInitialValueOverride(sliceStateOverride);
    }

    let override = slice._key._initialStateFieldValue;

    if (sliceStateOverride) {
      const normalizedOverride = Object.fromEntries(
        Object.entries(sliceStateOverride).map(([fieldName, val]) => [
          slice._getFieldByName(fieldName).id,
          val,
        ]),
      );

      override = {
        ...override,
        ...normalizedOverride,
      };
    }
    return new SliceStateManager(slice, override);
  }

  private constructor(
    public readonly slice: Slice,
    // @internal
    private readonly sliceState: Record<FieldId, unknown>,
  ) {}

  /**
   * Raw state includes the state of all fields (internal and external) with fieldIds as keys.
   */
  get rawState(): Record<FieldId, unknown> {
    return this.sliceState;
  }

  // @internal
  _getFieldStateVal(field: StateField): unknown {
    return this.sliceState[field.id];
  }

  // @internal
  _updateFieldState(field: StateField, updater: any): SliceStateManager {
    const oldValue = this._getFieldStateVal(field);
    const newValue =
      typeof updater === 'function' ? updater(oldValue) : updater;

    if (field.isEqual(oldValue, newValue)) {
      return this;
    }

    return new SliceStateManager(this.slice, {
      ...this.sliceState,
      [field.id]: newValue,
    });
  }
}
