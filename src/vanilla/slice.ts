import type { EffectCallback, EffectOpts, EffectStore } from './effect/effect';
import {
  StateField,
  type BaseField,
  BaseFieldOptions,
  DerivedField,
} from './field';
import { createFieldId } from './helpers/create-ids';
import { idGeneration } from './helpers/id-generation';
import { throwValidationError } from './helpers/throw-error';
import type { StoreState } from './store-state';
import { Transaction } from './transaction';
import type { SliceId, FieldId, NoInfer } from './types';

export function createKey(name: string, dependencies: Slice[] = []) {
  return new Key(name, dependencies);
}

export class Key {
  constructor(
    public readonly name: string,
    public readonly dependencies: Slice[],
  ) {}

  _effectCallbacks: [EffectCallback, Partial<EffectOpts>][] = [];

  _slice: Slice | undefined;

  _assertedSlice(): Slice {
    if (!this._slice) {
      throwValidationError(
        `Slice "${this.name}" does not exist. A slice must be created before it can be used.`,
      );
    }

    return this._slice;
  }

  _knownFields = new Set<BaseField<any>>();

  field<TVal>(val: TVal, options: BaseFieldOptions<NoInfer<TVal>> = {}) {
    const fieldState = new StateField(val, this, options);
    this._knownFields.add(fieldState);
    return fieldState;
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
    const derivedField = new DerivedField(cb, this, options);
    this._knownFields.add(derivedField);
    return derivedField;
  }
}

type MapSliceState<TFieldsSpec extends Record<string, BaseField<any>>> = {
  [K in keyof TFieldsSpec]: TFieldsSpec[K] extends BaseField<infer T>
    ? T
    : never;
};

export class Slice<TFieldsSpec extends Record<string, BaseField<any>> = any> {
  sliceId: SliceId;

  _initialStateFieldValue: Record<FieldId, any> = {};
  private derivedFields: Record<FieldId, DerivedField<any>> = {};

  private getCache = new WeakMap<StoreState, any>();

  get dependencies(): Slice[] {
    return this._key.dependencies;
  }

  /**
   * Called when the user overrides the initial value of a slice in the store.
   */
  _verifyInitialValueOverride(val: Record<FieldId, unknown>): void {
    // TODO: when user provides an override, do more checks
    if (
      Object.keys(val).length !==
      Object.keys(this._initialStateFieldValue).length
    ) {
      throwValidationError(
        `Slice "${this.name}" has fields that are not defined in the override. Did you forget to pass a state field?`,
      );
    }
  }

  constructor(
    public readonly name: string,
    private fieldsSpec: TFieldsSpec,
    public readonly _key: Key,
  ) {
    this.sliceId = idGeneration.createSliceId(name);

    if (_key._knownFields.size !== Object.keys(fieldsSpec).length) {
      throwValidationError(
        `Slice "${name}" has fields that are not defined in the state spec. Did you forget to pass a state field?`,
      );
    }

    for (const [fieldName, field] of Object.entries(fieldsSpec)) {
      if (!_key._knownFields.has(field)) {
        throwValidationError(`Field "${fieldName}" was not found.`);
      }

      field._fieldId = createFieldId(fieldName);

      if (field instanceof StateField) {
        this._initialStateFieldValue[field._fieldId] = field.initialValue;
      } else if (field instanceof DerivedField) {
        this.derivedFields[field._fieldId] = field;
      }
    }
  }

  /**
   * Get a field value from the slice state. Slightly faster than `get`.
   */
  getField<T extends keyof TFieldsSpec>(
    storeState: StoreState,
    fieldName: T,
  ): MapSliceState<TFieldsSpec>[T] {
    const id = fieldName as FieldId;

    if (this.derivedFields[id]) {
      return this.derivedFields[id]!.get(storeState);
    }

    return storeState._getSliceStateManager(this).sliceState[id] as any;
  }

  get(storeState: StoreState): MapSliceState<TFieldsSpec> {
    const existing = this.getCache.get(storeState);

    if (existing) {
      return existing;
    }

    // TODO: compare using object merge with dynamic getters
    const result = new Proxy(
      storeState._getSliceStateManager(this).sliceState,
      {
        get: (target, prop: FieldId, receiver) => {
          // this could have been a simple undefined check, but for some reason
          // jest  is hijacking the proxy
          if (this.derivedFields[prop] instanceof DerivedField) {
            return this.derivedFields[prop]!.get(storeState);
          }

          return Reflect.get(target, prop, receiver);
        },

        has: (target, prop) => {
          if (this.derivedFields[prop as FieldId] instanceof DerivedField) {
            return true;
          }
          return Reflect.has(target, prop);
        },

        ownKeys: (target) => {
          return [
            ...Reflect.ownKeys(target),
            ...Object.keys(this.derivedFields),
          ];
        },

        getOwnPropertyDescriptor: (target, prop) => {
          if (this.derivedFields[prop as FieldId] instanceof DerivedField) {
            return {
              configurable: true,
              enumerable: true,
            };
          }
          return Reflect.getOwnPropertyDescriptor(target, prop);
        },
      },
    ) as any;

    this.getCache.set(storeState, result);

    return result;
  }

  track(store: EffectStore): MapSliceState<TFieldsSpec> {
    return new Proxy(this.get(store.state), {
      get: (target, prop: FieldId, receiver) => {
        const val = Reflect.get(target, prop, receiver);
        const field: BaseField<unknown> = this.fieldsSpec[prop]!;

        // track this field
        store._getRunInstance().addTrackedField(this, field, val);

        return val;
      },
    });
  }

  /**
   * Similar to `track`, but only tracks a single field.
   */
  trackField<T extends keyof TFieldsSpec>(
    store: EffectStore,
    fieldName: T,
  ): MapSliceState<TFieldsSpec>[T] {
    const id = fieldName as FieldId;
    const val = this.getField(store.state, id);
    const field: BaseField<unknown> = this.fieldsSpec[id]!;

    // track this field
    store._getRunInstance().addTrackedField(this, field, val);

    return val as any;
  }
}
