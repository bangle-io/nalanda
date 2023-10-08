import type { EffectStore } from '../effect/effect';
import { BaseField, DerivedField } from './field';
import { sliceIdCounters } from '../helpers/id-generation';
import { throwValidationError } from '../helpers/throw-error';
import type { StoreState } from '../store-state';
import type {
  SliceId,
  FieldId,
  IfSubsetOfState,
  IfSubsetEffectStore,
  Simplify,
} from '../types';
import type { AnyAction, AnyExternal, Key } from './key';

export type InferSliceFieldState<T extends AnyExternal> = {
  // key mapping
  [K in keyof T as T[K] extends BaseField<any>
    ? K
    : never]: T[K] extends BaseField<infer T> ? T : never;
  //          ^^ value mapping
};

export type InferSliceActions<T extends AnyExternal> = {
  // key mapping
  [K in keyof T as T[K] extends AnyAction ? K : never]: T[K];
  //                                                    ^^ value mapping
};

export type ExposedSliceFieldNames<T extends AnyExternal> =
  keyof InferSliceFieldState<T>;

export type InferSliceNameFromSlice<T> = T extends Slice<
  any,
  infer TSliceName,
  any
>
  ? TSliceName
  : never;

export type InferDepNameFromSlice<T> = T extends Slice<any, any, infer TDepName>
  ? TDepName
  : never;

export class Slice<
  TExternal extends AnyExternal = any,
  TName extends string = any,
  TDep extends string = any,
> {
  sliceId: SliceId;

  // @internal
  private getCache = new WeakMap<StoreState<any>, any>();
  // @internal
  private fieldNameToField: Record<string, BaseField<any>> = {};

  public actions: InferSliceActions<TExternal>;

  get dependencies(): Slice[] {
    return this._key.dependencies;
  }

  static create<
    TExternal extends AnyExternal,
    TName extends string,
    TDep extends string,
  >(
    name: TName,
    external: TExternal,
    key: Key<TName, TDep>,
  ): Slice<TExternal, TName, TDep> & InferSliceActions<TExternal> {
    return new Slice(name, external, key) as any;
  }

  // @internal
  protected constructor(
    public readonly name: TName,
    external: TExternal,
    // @internal
    public readonly _key: Key<TName, TDep>,
  ) {
    this.sliceId = sliceIdCounters.generate(name);
    this.actions = {} as any;
    for (const [key, val] of Object.entries(external)) {
      if (!(val instanceof BaseField)) {
        if (key in this) {
          throwValidationError(
            `Invalid action name "${key}" as at it conflicts with a known property with the same name on the slice.`,
          );
        }

        (this.actions as any)[key] = val;
        continue;
      }

      const field = val;
      if (!_key._fields.has(field)) {
        throwValidationError(`Field "${key}" was not found.`);
      }
      field.name = key;
      this.fieldNameToField[key] = field;
    }

    Object.assign(this, this.actions);
  }

  get<TState extends StoreState<any>>(
    storeState: IfSubsetOfState<TName | TDep, TState>,
  ): Simplify<InferSliceFieldState<TExternal>> {
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
  getField<
    T extends keyof InferSliceFieldState<TExternal>,
    TState extends StoreState<any>,
  >(
    storeState: IfSubsetOfState<TName | TDep, TState>,
    fieldName: T,
  ): InferSliceFieldState<TExternal>[T] {
    return this._getFieldByName(fieldName as string).get(storeState) as any;
  }

  track<TEStore extends EffectStore>(
    store: IfSubsetEffectStore<TName | TDep, TEStore>,
  ): Simplify<InferSliceFieldState<TExternal>> {
    return new Proxy(this.get(store.state), {
      get: (target, prop: string, receiver) => {
        return this._getFieldByName(prop).track(store);
      },
    }) as any;
  }

  /**
   * Similar to `track`, but only tracks a single field.
   */
  trackField<
    T extends ExposedSliceFieldNames<TExternal>,
    TEStore extends EffectStore,
  >(
    store: IfSubsetEffectStore<TName | TDep, TEStore>,
    fieldName: T,
  ): InferSliceFieldState<TExternal>[T] {
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
