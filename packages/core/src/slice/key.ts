import type { EffectCallback, EffectOpts, EffectStore } from '../effect/effect';
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

/**
 * @param name - The name of the slice.
 * @param dependencies - An array of slices that this slice depends on.
 */
export function createKey(name: string, dependencies: Slice[] = []) {
  return new Key(name, dependencies);
}

export class Key {
  constructor(
    public readonly name: string,
    public readonly dependencies: Slice[],
  ) {}

  /**
   *
   * @param compute - A function that computes the derived value.
   * @param options
   */
  derive<TVal>(
    compute: (storeState: StoreState<any>) => TVal,
    options: BaseFieldOptions<NoInfer<TVal>> = {},
  ) {
    return this.registerField(new DerivedField(compute, this, options));
  }

  effect(callback: EffectCallback, opts: Partial<EffectOpts> = {}) {
    this._effectCallbacks.push([callback, opts]);
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

  slice<TFieldsSpec extends Record<string, BaseField<any>>>({
    fields,
    actions,
  }: {
    fields: TFieldsSpec;
    actions?: (...args: any) => Transaction;
  }): Slice<TFieldsSpec> {
    if (this._slice) {
      throwValidationError(
        `Slice "${this.name}" already exists. A key can only be used to create one slice.`,
      );
    }

    this._slice = new Slice(this.name, fields, this);

    return this._slice;
  }

  /**
   * Creates a new transaction object which is used to update the slice state.
   */
  transaction() {
    return new Transaction();
  }

  // @internal
  private _slice: Slice | undefined;
  // @internal
  _effectCallbacks: [EffectCallback, Partial<EffectOpts>][] = [];
  // @internal
  readonly _derivedFields: Record<FieldId, DerivedField<any>> = {};
  // @internal
  readonly _initialStateFieldValue: Record<FieldId, any> = {};
  // @internal
  readonly _fields = new Set<BaseField<any>>();
  // @internal
  readonly _fieldIdToFieldLookup: Record<FieldId, BaseField<any>> = {};

  // @internal
  _assertedSlice(): Slice {
    if (!this._slice) {
      throwValidationError(
        `Slice "${this.name}" does not exist. A slice must be created before it can be used.`,
      );
    }
    return this._slice;
  }

  // @internal
  private registerField<T extends BaseField<any>>(field: T): T {
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
