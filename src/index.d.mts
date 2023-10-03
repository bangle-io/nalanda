type Step = {
  cb: (storeState: StoreState) => StoreState;
};

declare class Transaction {
  readonly id: string;
  readonly metadata: Metadata;
  constructor();

  update(cb: Step['cb']): Transaction;
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
  private getCache;
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
  private getCache;
  private fieldNameToField;
  get dependencies(): Slice[];
  constructor(name: string, externalFieldSpec: TFieldsSpec, _key: Key);
  /**
   * Get a field value from the slice state. Slightly faster than `get`.
   */
  getField<T extends keyof TFieldsSpec>(
    storeState: StoreState,
    fieldName: T,
  ): MapSliceState<TFieldsSpec>[T];
  /**
   * Similar to `track`, but only tracks a single field.
   */
  trackField<T extends keyof TFieldsSpec>(
    store: EffectStore,
    fieldName: T,
  ): MapSliceState<TFieldsSpec>[T];
  get(storeState: StoreState): MapSliceState<TFieldsSpec>;
  track(store: EffectStore): MapSliceState<TFieldsSpec>;
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
  private config;
  static create(options: {
    slices: Slice[];
    stateOverride?: Record<SliceId, Record<string, unknown>>;
  }): StoreState;
  constructor(config: StoreStateConfig);
  apply(transaction: Transaction): StoreState;
}

declare class SliceStateManager {
  readonly slice: Slice;
  private readonly sliceState;
  static new(
    slice: Slice,
    sliceStateOverride?: Record<string, unknown>,
  ): SliceStateManager;
  constructor(slice: Slice, sliceState: Record<FieldId, unknown>);
  /**
   * Raw state includes the state of all fields (internal and external) with fieldIds as keys.
   */
  get rawState(): Record<FieldId, unknown>;
}

type CleanupCallback = () => void | Promise<void>;

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
  private _state;
  readonly initialState: StoreState;
  private effectsManager;
  private destroyed;
  private registeredSlicesEffect;
  private _dispatchTxn;
  get state(): StoreState;
  destroy(): void;
  isDestroyed(): boolean;
  constructor(options: StoreOptions);
  dispatch(transaction: Transaction | Operation): void;
  effect(callback: EffectCallback, opts?: Partial<EffectOpts>): Effect;
  runEffects(): void;
  private updateState;
}

declare class Operation {}

declare abstract class BaseStore {
  abstract readonly state: StoreState;
  abstract dispatch(txn: Transaction | Operation): void;
}

type TrackedFieldObj = {
  field: BaseField<unknown>;
  value: unknown;
};
declare class EffectRun {
  readonly store: Store;
  readonly name: string;
  private cleanups;
  private readonly trackedFields;
  private isDestroyed;
  get trackedCount(): number;
  constructor(store: Store, name: string);
  getTrackedFields(): ReadonlyArray<TrackedFieldObj>;
  addCleanup(cleanup: CleanupCallback): void;
  addTrackedField(field: BaseField<any>, val: unknown): void;
  whatDependenciesStateChange(): undefined | BaseField<any>;
  destroy(): void;
}

type EffectOpts = {
  /**
   *
   */
  maxWait: number;
  scheduler: EffectScheduler;
  name?: string;
};
declare class EffectStore extends BaseStore {
  readonly name: string;
  constructor(
    /**
     * @internal
     */
    _rootStore: Store,
    name: string,
    /**
     * @internal
     */
    _getRunInstance: () => EffectRun,
  );
  get state(): StoreState;
  dispatch(txn: Transaction | Operation): void;
}
type EffectScheduler = (
  cb: () => void,
  opts: Omit<EffectOpts, 'scheduler'> & {},
) => void;
type EffectCallback = (store: EffectStore) => void | Promise<void>;
declare class Effect {
  private readonly effectCallback;
  private readonly rootStore;
  readonly opts: EffectOpts;
  readonly name: string;
  readonly debug: DebugLogger | undefined;
  private destroyed;
  private pendingRun;
  private readonly effectStore;
  private readonly scheduler;
  private runCount;
  private runInstance;
  constructor(
    effectCallback: EffectCallback,
    rootStore: Store,
    opts: EffectOpts,
  );
  destroy(): void;
  /**
   * If slicesChanged is undefined, it will attempt to run the effect provided other conditions are met.
   * The effect is guaranteed to run at least once.
   * @param slicesChanged
   * @returns
   */
  run(slicesChanged?: Set<Slice>): boolean;
  private shouldQueueRun;
  private _run;
}

/**
 * @param name - the name of the slice
 * @param dependencies - the slices that this slice depends on
 */
declare function createKey(name: string, dependencies?: Slice[]): Key;
declare class Key {
  readonly name: string;
  readonly dependencies: Slice[];
  constructor(name: string, dependencies: Slice[]);
  private _slice;
  _effectCallbacks: [EffectCallback, Partial<EffectOpts>][];
  readonly _derivedFields: Record<FieldId, DerivedField<any>>;
  readonly _initialStateFieldValue: Record<FieldId, any>;
  readonly _fields: Set<BaseField<any>>;
  readonly _fieldIdToFieldLookup: Record<FieldId, BaseField<any>>;
  hasField(field: BaseField<any>): boolean;
  _assertedSlice(): Slice;
  private registerField;
  field<TVal>(
    val: TVal,
    options?: BaseFieldOptions<NoInfer<TVal>>,
  ): StateField<NoInfer<TVal>>;
  slice<TFieldsSpec extends Record<string, BaseField<any>>>({
    fields,
    actions,
  }: {
    fields: TFieldsSpec;
    actions?: (...args: any) => Transaction;
  }): Slice<TFieldsSpec>;
  transaction(): Transaction;
  effect(callback: EffectCallback, opts?: Partial<EffectOpts>): void;
  derive<TVal>(
    cb: (storeState: StoreState) => TVal,
    options?: BaseFieldOptions<NoInfer<TVal>>,
  ): DerivedField<NoInfer<TVal>>;
}

export { createKey, createStore };
