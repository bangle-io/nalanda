import {
  StateField,
  type BaseField,
  BaseFieldOptions,
  DerivedField,
} from './field';
import { throwValidationError } from '../helpers/throw-error';
import type { StoreState } from '../store-state';
import { Transaction } from '../transaction';
import type { FieldId, NoInfer } from '../types';
import { Slice } from './slice';
import type { InferSliceActions, InferSliceNameFromSlice } from './slice';
import { EventListener } from '../helpers/event-listener';
import { EffectCallback, EffectOpts } from '../effect/types';
import { EffectConfig } from '../effect/types';
import { createEffectConfig } from '../effect/effect';
/**
 * @param name - The name of the slice.
 * @param dependencies - An array of slices that this slice depends on.
 */
export function createKey<TName extends string, TDepSlice extends Slice>(
  name: TName,
  dependencies: TDepSlice[],
) {
  return new Key<TName, InferSliceNameFromSlice<TDepSlice>>(name, dependencies);
}

export type AnyAction = (...args: any) => Transaction<any, any>;
export type AnyExternal = Record<string, AnyAction | BaseField<any, any, any>>;

type KeyEvents = {
  type: 'new-effect';
  payload: EffectConfig;
};

export class Key<TName extends string, TDepName extends string> {
  // @internal
  readonly _keyEvents = new EventListener<KeyEvents>();

  constructor(
    public readonly name: TName,
    public readonly dependencies: Slice<any, TDepName, any>[],
  ) {}

  /**
   *
   * @param compute - A function that computes the derived value.
   * @param options
   */
  derive<TVal>(
    compute: (storeState: StoreState<TName | TDepName>) => TVal,
    options: BaseFieldOptions<NoInfer<TVal>> = {},
  ) {
    return this.registerField(new DerivedField(compute, this, options));
  }

  effect(
    callback: EffectCallback<TName | TDepName>,
    options: Partial<EffectOpts> = {},
  ) {
    const effect = createEffectConfig(callback, options);

    this._effects.push(effect);
    // for any effect that was created post store creation,
    // we need to manually alert the store to register the effect.
    this._keyEvents.emit({
      type: 'new-effect',
      payload: effect,
    });

    return effect.name;
  }

  /**
   * @param initialValue - The initial value of the field.
   * @param options
   */
  field<TVal>(
    initialValue: TVal,
    options: BaseFieldOptions<NoInfer<TVal>> = {},
  ) {
    return this.registerField(new StateField(initialValue, this, options));
  }

  slice<TExternal extends AnyExternal>(
    external: TExternal,
  ): Slice<TExternal, TName, TDepName> & InferSliceActions<TExternal> {
    if (this._slice) {
      throwValidationError(
        `Slice "${this.name}" already exists. A key can only be used to create one slice.`,
      );
    }

    this._slice = Slice.create(this.name, external, this);

    return this._slice as any;
  }

  /**
   * Creates a new transaction object which is used to update the slice state.
   */
  transaction() {
    return new Transaction<TName, TDepName>();
  }

  // @internal
  private _slice: Slice | undefined;
  // @internal
  _effects: EffectConfig[] = [];
  // @internal
  readonly _derivedFields: Record<FieldId, DerivedField<any, any, any>> = {};
  // @internal
  readonly _initialStateFieldValue: Record<FieldId, any> = {};
  // @internal
  readonly _fields = new Set<BaseField<any, any, any>>();
  // @internal
  readonly _fieldIdToFieldLookup: Record<FieldId, BaseField<any, any, any>> =
    {};

  // @internal
  _assertedSlice(): Slice {
    if (!this._slice) {
      throwValidationError(
        `Slice "${this.name}" does not exist. Did you forget to create a slice using key.slice() ?`,
      );
    }
    return this._slice;
  }

  // @internal
  private registerField<T extends BaseField<any, any, any>>(field: T): T {
    this._fields.add(field);
    this._fieldIdToFieldLookup[field.id] = field;

    if (field instanceof StateField) {
      this._initialStateFieldValue[field.id] = field.initialValue;
    } else if (field instanceof DerivedField) {
      this._derivedFields[field.id] = field;
    }

    return field;
  }
}
