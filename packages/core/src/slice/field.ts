import { fieldIdCounters } from '../helpers/id-generation';
import { throwValidationError } from '../helpers/throw-error';
import type { Key } from './key';
import { StoreState } from '../store-state';
import { Transaction } from '../transaction';
import type { FieldId, IfSubsetOfState, IfSubsetEffectStore } from '../types';
import { EffectStore } from '../effect/effect-store';

export type BaseFieldOptions<TVal> = {
  equal?: (a: TVal, b: TVal) => boolean;
};

export abstract class BaseField<
  TVal = any,
  TName extends string = any,
  TDep extends string = any,
> {
  readonly id: FieldId;

  name: string | undefined;

  constructor(
    public readonly key: Key<TName, TDep>,
    public readonly options: BaseFieldOptions<TVal>,
  ) {
    this.id = fieldIdCounters.generate(key.name);
  }

  abstract get<TState extends StoreState<any>>(
    storeState: IfSubsetOfState<TName, TState>,
  ): TVal;

  isEqual(a: TVal, b: TVal): boolean {
    if (this.options.equal) {
      return this.options.equal(a, b);
    }
    return Object.is(a, b);
  }

  track<TEStore extends EffectStore>(
    store: IfSubsetEffectStore<TName | TDep, TEStore>,
  ) {
    const state: any = store.state satisfies StoreState<any>;
    const value = this.get(state);
    store._addTrackField({
      field: this,
      value,
    });
    return value;
  }

  // @internal
  _getSlice() {
    return this.key._assertedSlice();
  }
}

export class DerivedField<
  TVal,
  TName extends string,
  TDep extends string,
> extends BaseField<TVal, TName, TDep> {
  constructor(
    public readonly deriveCallback: (state: StoreState<TName | TDep>) => TVal,
    key: Key<TName, TDep>,
    options: BaseFieldOptions<TVal>,
  ) {
    super(key, options);
  }

  // @internal
  private getCache = new WeakMap<StoreState<any>, any>();
  private prevValCache = new WeakMap<StoreState<any>['_ref'], TVal>();

  get<TState extends StoreState<any>>(
    storeState: IfSubsetOfState<TName, TState>,
  ): TVal {
    if (!this.id) {
      throwValidationError(
        `Cannot access state before Slice "${this.key.name}" has been created.`,
      );
    }

    if (this.getCache.has(storeState)) {
      return this.getCache.get(storeState);
    }

    const derivedVal = this.deriveCallback(storeState);
    const finalVal = this._maintainOldReference(storeState, derivedVal);

    this.getCache.set(storeState, finalVal);

    return finalVal;
  }

  // maintain the old reference  (if possible) when the value is equal to the previous value
  // @internal
  _maintainOldReference(storeState: StoreState<any>, newValue: TVal) {
    const ref = storeState._ref;

    const hasPrevValue = this.prevValCache.has(ref);

    if (!hasPrevValue) {
      this.prevValCache.set(ref, newValue);
      return newValue;
    }

    const prevValue = this.prevValCache.get(ref)!;

    if (this.isEqual(prevValue, newValue)) {
      return prevValue;
    }

    this.prevValCache.set(ref, newValue);
    return newValue;
  }
}

export class StateField<
  TVal = any,
  TName extends string = any,
  TDep extends string = any,
> extends BaseField<TVal, TName, TDep> {
  constructor(
    public readonly initialValue: TVal,
    key: Key<TName, TDep>,
    options: BaseFieldOptions<TVal>,
  ) {
    super(key, options);
  }

  get<TState extends StoreState<any>>(
    storeState: IfSubsetOfState<TName, TState>,
  ): TVal {
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

  update(val: TVal | ((val: TVal) => TVal)): Transaction<TName, TDep> {
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
