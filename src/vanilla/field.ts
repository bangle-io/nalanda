import { throwValidationError } from './helpers/throw-error';
import type { Key } from './slice';
import { StoreState } from './store-state';
import { Transaction } from './transaction';
import type { FieldId } from './types';

export type BaseFieldOptions<TVal> = {
  equal?: (a: TVal, b: TVal) => boolean;
};

export abstract class BaseField<TVal> {
  _fieldId: FieldId | undefined;

  constructor(
    public readonly key: Key,
    public readonly options: BaseFieldOptions<TVal>,
  ) {}

  abstract get(storeState: StoreState): TVal;

  abstract _getFromSliceState(
    sliceState: Record<FieldId, unknown>,
    storeState: StoreState,
  ): TVal;

  isEqual(a: TVal, b: TVal): boolean {
    if (this.options.equal) {
      return this.options.equal(a, b);
    }
    return Object.is(a, b);
  }
}

export class DerivedField<TVal> extends BaseField<TVal> {
  constructor(
    public readonly deriveCallback: (state: StoreState) => TVal,
    key: Key,
    options: BaseFieldOptions<TVal>,
  ) {
    super(key, options);
  }

  private getCache = new WeakMap<StoreState, any>();

  _getFromSliceState(
    sliceState: Record<FieldId, unknown>,
    storeState: StoreState,
  ): TVal {
    return this.deriveCallback(storeState);
  }

  get(storeState: StoreState): TVal {
    if (!this._fieldId) {
      throwValidationError(
        `Cannot access state before Slice "${this.key.name}" has been created.`,
      );
    }

    // TODO: return previously seen value based on isEqual and the lineage of store-state

    if (this.getCache.has(storeState)) {
      return this.getCache.get(storeState);
    }

    const newValue = this.deriveCallback(storeState);

    this.getCache.set(storeState, newValue);

    return newValue;
  }
}

export class StateField<TVal = any> extends BaseField<TVal> {
  constructor(
    public readonly initialValue: TVal,
    key: Key,
    options: BaseFieldOptions<TVal>,
  ) {
    super(key, options);
  }

  _getFromSliceState(
    sliceState: Record<FieldId, unknown>,
    storeState: StoreState,
  ): TVal {
    return sliceState[this._fieldId!] as TVal;
  }

  get(storeState: StoreState): TVal {
    if (!this._fieldId) {
      throwValidationError(
        `Cannot access state before Slice "${this.key.name}" has been created.`,
      );
    }
    const slice = this.key._assertedSlice();

    return slice.get(storeState)[this._fieldId] as TVal;
  }

  update(val: TVal | ((val: TVal) => TVal)): Transaction {
    const txn = this.key.transaction();

    txn._addStep({
      cb: (state: StoreState) => {
        const slice = this.key._assertedSlice();
        const manager = state._getSliceStateManager(slice);

        const newManager = manager._updateFieldState(this, val);

        if (newManager === manager) {
          return state;
        }

        return state._updateSliceStateManager(slice, newManager);
      },
    });

    return txn;
  }
}
