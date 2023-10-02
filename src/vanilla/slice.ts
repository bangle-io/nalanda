import type { EffectCallback, EffectOpts, EffectStore } from './effect/effect';
import { createFieldId } from './helpers/create-ids';
import { idGeneration } from './helpers/id-generation';
import { throwValidationError } from './helpers/throw-error';
import type { StoreState } from './store-state';
import { Transaction } from './transaction';
import type { SliceId, FieldId } from './types';

export function createKey(name: string, dependencies: Slice[] = []) {
  return new Key(name, dependencies);
}

class Key {
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

  _knownFieldState = new Set<FieldState>();

  field<TVal>(val: TVal) {
    const fieldState = new FieldState(val, this);
    this._knownFieldState.add(fieldState);
    return fieldState;
  }

  slice<TFieldsSpec extends Record<string, FieldState>>({
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
}

export class FieldState<T = any> {
  _fieldId: FieldId | undefined;

  constructor(
    public readonly initialValue: T,
    public readonly key: Key,
  ) {}

  _getFromSliceState(sliceState: Record<FieldId, unknown>): T {
    return sliceState[this._fieldId!] as T;
  }

  get(storeState: StoreState): T {
    if (!this._fieldId) {
      throwValidationError(
        `Cannot access state before Slice "${this.key.name}" has been created.`,
      );
    }
    const slice = this.key._assertedSlice();

    return slice.get(storeState)[this._fieldId] as T;
  }

  isEqual(a: T, b: T): boolean {
    // TODO: allow users to provide a custom equality function
    return Object.is(a, b);
  }

  update(val: T | ((val: T) => T)): Transaction {
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

type MapSliceState<TFieldsSpec extends Record<string, FieldState>> = {
  [K in keyof TFieldsSpec]: TFieldsSpec[K] extends FieldState<infer T>
    ? T
    : never;
};

export class Slice<TFieldsSpec extends Record<string, FieldState> = any> {
  sliceId: SliceId;

  readonly initialValue: MapSliceState<TFieldsSpec>;

  get dependencies(): Slice[] {
    return this._key.dependencies;
  }

  /**
   * Called when the user overrides the initial value of a slice in the store.
   */
  _verifyInitialValueOverride(val: Record<FieldId, unknown>): void {
    // TODO: when user provides an override, do more checks
    if (Object.keys(val).length !== Object.keys(this.initialValue).length) {
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

    if (_key._knownFieldState.size !== Object.keys(fieldsSpec).length) {
      throwValidationError(
        `Slice "${name}" has fields that are not defined in the state spec. Did you forget to pass a state field?`,
      );
    }

    for (const [fieldName, fieldState] of Object.entries(fieldsSpec)) {
      if (!_key._knownFieldState.has(fieldState)) {
        throwValidationError(`Field "${fieldName}" was not found.`);
      }

      fieldState._fieldId = createFieldId(fieldName);
    }

    this.initialValue = Object.fromEntries(
      Object.entries(fieldsSpec).map(([fieldName, fieldState]) => [
        fieldName,
        fieldState.initialValue,
      ]),
    ) as any;
  }

  get(storeState: StoreState): MapSliceState<TFieldsSpec> {
    return storeState._getSliceStateManager(this).sliceState as any;
  }

  track(store: EffectStore): MapSliceState<TFieldsSpec> {
    return new Proxy(this.get(store.state), {
      get: (target, prop: FieldId) => {
        const val = target[prop];

        const field: FieldState = this.fieldsSpec[prop]!;

        // track this field
        store._getRunInstance().addTrackedField(this, field, val);

        return val;
      },
    });
  }
}
