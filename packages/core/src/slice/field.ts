import { EffectStore } from '../effect/effect';
import { fieldIdCounters } from '../helpers/id-generation';
import { throwValidationError } from '../helpers/throw-error';
import type { Key } from './key';
import { StoreState } from '../store-state';
import { Transaction } from '../transaction';
import type { FieldId } from '../types';

export type BaseFieldOptions<TVal> = {
  equal?: (a: TVal, b: TVal) => boolean;
};

export abstract class BaseField<TVal> {
  readonly id: FieldId;

  name: string | undefined;

  constructor(
    public readonly key: Key,
    public readonly options: BaseFieldOptions<TVal>,
  ) {
    this.id = fieldIdCounters.generate(key.name);
  }

  abstract get(storeState: StoreState<any>): TVal;

  isEqual(a: TVal, b: TVal): boolean {
    if (this.options.equal) {
      return this.options.equal(a, b);
    }
    return Object.is(a, b);
  }

  track(store: EffectStore) {
    const value = this.get(store.state);
    store._getRunInstance().addTrackedField(this, value);
    return value;
  }

  // @internal
  _getSlice() {
    return this.key._assertedSlice();
  }
}

export class DerivedField<TVal> extends BaseField<TVal> {
  constructor(
    public readonly deriveCallback: (state: StoreState<any>) => TVal,
    key: Key,
    options: BaseFieldOptions<TVal>,
  ) {
    super(key, options);
  }

  // @internal
  private getCache = new WeakMap<StoreState<any>, any>();

  get(storeState: StoreState<any>): TVal {
    if (!this.id) {
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

  get(storeState: StoreState<any>): TVal {
    if (!this.id) {
      throwValidationError(
        `Cannot access state before Slice "${this.key.name}" has been created.`,
      );
    }
    const slice = this.key._assertedSlice();
    return storeState
      ._getSliceStateManager(slice)
      ._getFieldStateVal(this) as TVal;
  }

  update(val: TVal | ((val: TVal) => TVal)): Transaction {
    const txn = this.key.transaction();

    return txn.step((state: StoreState<any>) => {
      const slice = this.key._assertedSlice();
      const manager = state._getSliceStateManager(slice);

      const newManager = manager._updateFieldState(this, val);

      if (newManager === manager) {
        return state;
      }

      return state._updateSliceStateManager(slice, newManager);
    });
  }
}
