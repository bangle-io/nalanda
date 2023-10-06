type Step = {
  stepper: (storeState: StoreState) => StoreState;
};
declare class Transaction {
  readonly id: string;
  readonly metadata: Metadata;
  constructor();
  step(stepper: Step['stepper']): Transaction;
}
declare class Metadata {
  appendMetadata(key: string, val: string): void;
  fork(): Metadata;
  getMetadata(key: string): string | undefined;
  setMetadata(key: string, val: string): void;
}

/**
 * Hack for nominal typing
 * https://basarat.gitbook.io/typescript/main-1/nominaltyping
 */
declare const __brand: unique symbol;
type Brand<T, K> = T & {
  [__brand]: K;
};
type NoInfer<T> = [T][T extends any ? 0 : never];
type SliceId = Brand<string, 'SliceId'>;
type FieldId = Brand<string, 'FieldId'>;
type IfSubset<T, U, Y, N = never> = [T] extends [U] ? Y : N;

/**
 * @param name - The name of the slice.
 * @param dependencies - An array of slices that this slice depends on.
 */
declare function createKey(name: string, dependencies?: Slice[]): Key;
declare class Key {
  readonly name: string;
  readonly dependencies: Slice[];
  constructor(name: string, dependencies: Slice[]);
  /**
   *
   * @param compute - A function that computes the derived value.
   * @param options
   */
  derive<TVal>(
    compute: (storeState: StoreState) => TVal,
    options?: BaseFieldOptions<NoInfer<TVal>>,
  ): DerivedField<NoInfer<TVal>>;
  effect(callback: EffectCallback, opts?: Partial<EffectOpts>): void;
  /**
   * @param initialValue - The initial value of the field.
   * @param options
   */
  field<TVal>(
    initialValue: TVal,
    options?: BaseFieldOptions<NoInfer<TVal>>,
  ): StateField<NoInfer<TVal>>;
  slice<TFieldsSpec extends Record<string, BaseField<any>>>({
    fields,
    actions,
  }: {
    fields: TFieldsSpec;
    actions?: (...args: any) => Transaction;
  }): Slice<TFieldsSpec>;
  /**
   * Creates a new transaction object which is used to update the slice state.
   */
  transaction(): Transaction;
}

type BaseFieldOptions<TVal> = {
  equal?: (a: TVal, b: TVal) => boolean;
};
declare abstract class BaseField<TVal> {
  readonly key: Key;
  readonly options: BaseFieldOptions<TVal>;
  readonly id: FieldId;
  name: string | undefined;
  constructor(key: Key, options: BaseFieldOptions<TVal>);
  abstract get(storeState: StoreState): TVal;
  isEqual(a: TVal, b: TVal): boolean;
  track(store: EffectStore): TVal;
}
declare class DerivedField<TVal> extends BaseField<TVal> {
  readonly deriveCallback: (state: StoreState) => TVal;
  constructor(
    deriveCallback: (state: StoreState) => TVal,
    key: Key,
    options: BaseFieldOptions<TVal>,
  );
  get(storeState: StoreState): TVal;
}
declare class StateField<TVal = any> extends BaseField<TVal> {
  readonly initialValue: TVal;
  constructor(initialValue: TVal, key: Key, options: BaseFieldOptions<TVal>);
  get(storeState: StoreState): TVal;
  update(val: TVal | ((val: TVal) => TVal)): Transaction;
}

type MapSliceState<TFieldsSpec extends Record<string, BaseField<any>>> = {
  [K in keyof TFieldsSpec]: TFieldsSpec[K] extends BaseField<infer T>
    ? T
    : never;
};
declare class Slice<TFieldsSpec extends Record<string, BaseField<any>> = any> {
  readonly name: string;
  sliceId: SliceId;
  get dependencies(): Slice[];
  get(storeState: StoreState): MapSliceState<TFieldsSpec>;
  /**
   * Get a field value from the slice state. Slightly faster than `get`.
   */
  getField<T extends keyof TFieldsSpec>(
    storeState: StoreState,
    fieldName: T,
  ): MapSliceState<TFieldsSpec>[T];
  track(store: EffectStore): MapSliceState<TFieldsSpec>;
  /**
   * Similar to `track`, but only tracks a single field.
   */
  trackField<T extends keyof TFieldsSpec>(
    store: EffectStore,
    fieldName: T,
  ): MapSliceState<TFieldsSpec>[T];
}

type SliceStateMap = Record<SliceId, SliceStateManager>;
interface StoreStateConfig {
  slices: Slice[];
  sliceStateMap: SliceStateMap;
  computed: {
    slicesLookup: Record<SliceId, Slice>;
    reverseSliceDependencies: Record<SliceId, Set<SliceId>>;
  };
}
declare class StoreState {
  static create(options: {
    slices: Slice[];
    stateOverride?: Record<SliceId, Record<string, unknown>>;
  }): StoreState;
  constructor(config: StoreStateConfig);
  apply(transaction: Transaction): StoreState;
}
declare class SliceStateManager {
  readonly slice: Slice;
  constructor(slice: Slice, sliceState: Record<FieldId, unknown>);
  /**
   * Raw state includes the state of all fields (internal and external) with fieldIds as keys.
   */
  get rawState(): Record<FieldId, unknown>;
}

type LogTypes = TransactionLog | OperationLog | EffectLog;
type DebugLogger = (log: LogTypes) => void;
interface TransactionLog {
  type: 'TRANSACTION';
  action?: string;
  dispatcher?: string | undefined;
  sourceSlice: SliceId;
  store?: string | undefined;
  id: string;
}
interface OperationLog {
  type: 'OPERATION';
  dispatcher?: string | undefined;
  store?: string | undefined;
  id: string;
}
interface EffectLog {
  type: 'SYNC_UPDATE_EFFECT' | 'UPDATE_EFFECT';
  name: string;
  changed: string;
}

interface StoreOptions {
  name?: string;
  slices: Slice[];
  debug?: DebugLogger;
  overrides?: {
    stateOverride?: Record<SliceId, Record<string, unknown>>;
    /**
     * Overrides all effects schedulers for all effects in the store.
     */
    effectSchedulerOverride?: EffectScheduler;
    dispatchTransactionOverride?: DispatchTransaction;
  };
  manualEffectsTrigger?: boolean;
}
type DispatchTransaction = (
  store: Store,
  updateState: (state: StoreState) => void,
  tx: Transaction,
) => void;
declare function createStore(config: StoreOptions): Store;
declare class Store extends BaseStore {
  readonly options: StoreOptions;
  readonly initialState: StoreState;
  get state(): StoreState;
  destroy(): void;
  isDestroyed(): boolean;
  constructor(options: StoreOptions);
  dispatch(transaction: Transaction | Operation): void;
  effect(callback: EffectCallback, opts?: Partial<EffectOpts>): Effect;
  runEffects(): void;
}

type OperationOpts = {
  deferred?: boolean;
  maxWait?: number;
};
declare class Operation {}
declare class OperationStore extends BaseStore {
  private rootStore;
  readonly name: string;
  private readonly opts;
  private cleanupRan;
  private readonly _cleanupCallbacks;
  _rootStore: Store;
  constructor(rootStore: Store, name: string, opts: OperationOpts);
  get state(): StoreState;
  dispatch(txn: Transaction | Operation): void;
  _addCleanup(cb: CleanupCallback): void;
  _runCleanup(): void;
}

declare abstract class BaseStore {
  abstract readonly state: StoreState;
  abstract dispatch(txn: Transaction | Operation): void;
}

type EffectOpts = {
  maxWait: number;
  scheduler: EffectScheduler;
  name?: string;
};
declare class EffectStore extends BaseStore {
  readonly name: string;
  get state(): StoreState;
  dispatch(txn: Transaction | Operation): void;
}
type EffectScheduler = (
  cb: () => void,
  opts: Omit<EffectOpts, 'scheduler'> & {},
) => void;
type EffectCallback = (store: EffectStore) => void | Promise<void>;
declare class Effect {
  readonly opts: EffectOpts;
  readonly name: string;
  destroy(): void;
}

type CleanupCallback = () => void | Promise<void>;
declare function cleanup(
  store: EffectStore | OperationStore,
  cb: CleanupCallback,
): void;

type RefObject<T> = {
  current: T;
};
declare function ref<T>(
  init: () => T,
): (store: Store | BaseStore) => RefObject<T>;

export { IfSubset, cleanup, createKey, createStore, ref };
