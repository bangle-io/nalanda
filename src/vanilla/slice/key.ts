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

export function createKey(name: string, dependencies: Slice[] = []) {
  return new Key(name, dependencies);
}

export class Key {
  constructor(
    public readonly name: string,
    public readonly dependencies: Slice[],
  ) {}

  private _slice: Slice | undefined;
  _effectCallbacks: [EffectCallback, Partial<EffectOpts>][] = [];
  readonly _derivedFields: Record<FieldId, DerivedField<any>> = {};
  readonly _initialStateFieldValue: Record<FieldId, any> = {};
  readonly _fields = new Set<BaseField<any>>();
  readonly _fieldIdToFieldLookup: Record<FieldId, BaseField<any>> = {};

  hasField(field: BaseField<any>) {
    return this._fields.has(field);
  }

  _assertedSlice(): Slice {
    if (!this._slice) {
      throwValidationError(
        `Slice "${this.name}" does not exist. A slice must be created before it can be used.`,
      );
    }
    return this._slice;
  }

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

  field<TVal>(val: TVal, options: BaseFieldOptions<NoInfer<TVal>> = {}) {
    return this.registerField(new StateField(val, this, options));
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

  transaction() {
    return new Transaction();
  }

  effect(callback: EffectCallback, opts: Partial<EffectOpts> = {}) {
    this._effectCallbacks.push([callback, opts]);
  }

  derive<TVal>(
    cb: (storeState: StoreState) => TVal,
    options: BaseFieldOptions<NoInfer<TVal>> = {},
  ) {
    return this.registerField(new DerivedField(cb, this, options));
  }
}
