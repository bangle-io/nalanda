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

  slice(stateSpec: Record<string, FieldState>) {
    if (this._slice) {
      throwValidationError(
        `Slice "${this.name}" already exists. A key can only be used to create one slice.`,
      );
    }

    this._slice = new Slice(this.name, stateSpec, this);

    return this._slice;
  }

  transaction() {
    return new Transaction();
  }
}

export class FieldState<T = any> {
  _fieldId: FieldId | undefined;

  constructor(
    public readonly initialValue: T,
    public readonly key: Key,
  ) {}

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

        return state._updateSliceStateManager(slice, newManager);
      },
    });

    return txn;
  }
}

export class Slice {
  sliceId: SliceId;

  readonly initialValue: Record<FieldId, unknown>;

  constructor(
    public readonly name: string,
    private stateSpec: Record<FieldId, FieldState>,
    private readonly key: Key,
  ) {
    this.sliceId = idGeneration.createSliceId(name);

    if (key._knownFieldState.size !== Object.keys(stateSpec).length) {
      throwValidationError(
        `Slice "${name}" has fields that are not defined in the state spec. Did you forget to pass a state field?`,
      );
    }

    for (const [fieldName, fieldState] of Object.entries(stateSpec)) {
      if (!key._knownFieldState.has(fieldState)) {
        throwValidationError(`Field "${fieldName}" was not found.`);
      }

      fieldState._fieldId = createFieldId(fieldName);
    }

    this.initialValue = Object.fromEntries(
      Object.entries(stateSpec).map(([fieldName, fieldState]) => [
        fieldName,
        fieldState.initialValue,
      ]),
    );
  }

  get(storeState: StoreState) {
    return storeState._getSliceStateManager(this).sliceState;
  }
}
