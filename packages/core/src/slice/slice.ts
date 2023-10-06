import type { EffectStore } from '../effect/effect';
import { type BaseField, DerivedField } from './field';
import { sliceIdCounters } from '../helpers/id-generation';
import { throwValidationError } from '../helpers/throw-error';
import type { StoreState } from '../store-state';
import type { SliceId, FieldId, NoInfer } from '../types';
import type { Key } from './key';

type MapSliceState<TFieldsSpec extends Record<string, BaseField<any>>> = {
  [K in keyof TFieldsSpec]: TFieldsSpec[K] extends BaseField<infer T>
    ? T
    : never;
};

export type AnySlice = Slice<any>;

export type InferSliceNameFromSlice<T> = T extends Slice<
  any,
  infer TSliceName,
  any
>
  ? TSliceName
  : never;

export class Slice<
  TFieldsSpec extends Record<string, BaseField<any>> = any,
  TSliceName extends string = any,
  TDepName extends string = any,
> {
  sliceId: SliceId;

  // @internal
  private getCache = new WeakMap<StoreState<any>, any>();
  // @internal
  private fieldNameToField: Record<string, BaseField<any>> = {};

  get dependencies(): Slice[] {
    return this._key.dependencies;
  }

  // @internal
  constructor(
    public readonly name: TSliceName,
    externalFieldSpec: TFieldsSpec,
    // @internal
    public readonly _key: Key<TSliceName, TDepName>,
  ) {
    this.sliceId = sliceIdCounters.generate(name);
    for (const [fieldName, field] of Object.entries(externalFieldSpec)) {
      if (!_key._fields.has(field)) {
        throwValidationError(`Field "${fieldName}" was not found.`);
      }
      field.name = fieldName;
      this.fieldNameToField[fieldName] = field;
    }
  }

  get(storeState: StoreState<any>): MapSliceState<TFieldsSpec> {
    const existing = this.getCache.get(storeState);

    if (existing) {
      return existing;
    }

    // since derived fields are lazy, we have to build this proxy
    const lazyExternalState = new Proxy(
      storeState._getSliceStateManager(this).rawState,
      {
        get: (target, fieldName: string, receiver) => {
          if (!this.fieldNameToField[fieldName]) {
            return undefined;
          }

          const field = this._getFieldByName(fieldName);

          // this could have been a simple undefined check, but for some reason
          // jest  is hijacking the proxy
          if (field instanceof DerivedField) {
            return field.get(storeState);
          }
          // map field name to id and then forward the get to raw state
          return Reflect.get(target, field.id, receiver);
        },

        has: (target, fieldName: string) => {
          return fieldName in this.fieldNameToField;
        },

        ownKeys: () => {
          return Object.keys(this.fieldNameToField);
        },

        getOwnPropertyDescriptor: (target, fieldName: string) => {
          if (!this.fieldNameToField[fieldName]) {
            return undefined;
          }

          const field = this._getFieldByName(fieldName);

          if (field instanceof DerivedField) {
            return {
              configurable: true,
              enumerable: true,
            };
          }

          return Reflect.getOwnPropertyDescriptor(target, field.id);
        },
      },
    ) as any;

    this.getCache.set(storeState, lazyExternalState);

    return lazyExternalState;
  }

  /**
   * Get a field value from the slice state. Slightly faster than `get`.
   */
  getField<T extends keyof TFieldsSpec>(
    storeState: StoreState<any>,
    fieldName: T,
  ): MapSliceState<TFieldsSpec>[T] {
    return this._getFieldByName(fieldName as string).get(storeState) as any;
  }

  track(store: EffectStore): MapSliceState<TFieldsSpec> {
    return new Proxy(this.get(store.state), {
      get: (target, prop: string, receiver) => {
        return this._getFieldByName(prop).track(store);
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
    return this._getFieldByName(fieldName as string).track(store) as any;
  }

  // @internal
  _getFieldByName(fieldName: string): BaseField<unknown> {
    const field = this.fieldNameToField[fieldName];
    if (field === undefined) {
      throwValidationError(`Field "${fieldName.toString()}" does not exist.`);
    }

    return field;
  }

  /**
   * Called when the user overrides the initial value of a slice in the store.
   */
  // @internal
  _verifyInitialValueOverride(val: Record<FieldId, unknown>): void {
    // // TODO: when user provides an override, do more checks
  }
}
