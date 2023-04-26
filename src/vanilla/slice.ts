import { weakCache } from './helpers';
import { StoreState } from './state';
import { Transaction } from './transaction';
import type {
  ActionBuilder,
  DerivedStateFn,
  Effect,
  ValidStoreState,
  LineageId,
  PickOpts,
  TransactionBuilder,
  UnknownEffect,
} from './types';

export type UnknownSlice = Slice<string, unknown, string, unknown>;
export type AnySlice = Slice<string, any, string, any>;
export type AnySliceWithName<N extends string> = Slice<N, any, string, any>;
export type UnknownSliceWithName<N extends string> = Slice<
  N,
  unknown,
  any,
  unknown
>;

export type SliceReducer<
  N extends string,
  TState,
  TDependency extends string,
  TDerivedState,
> = (
  sliceState: TState,
  tx: Transaction<N, any[]>,
  action: ActionBuilder<any, TState, TDependency>,
  storeState: StoreState<N | TDependency>,
  slice: Slice<N, TState, TDependency, TDerivedState>,
) => TState;

export interface SliceInputSpec<
  N extends string,
  TState,
  TDependency extends string,
  TDerivedState,
> {
  readonly name: N;
  readonly initState: TState;
  readonly dependencies: Slice<TDependency, unknown, never, unknown>[];
  readonly terminal?: boolean;
  // TODO: Adding generics here messes up things
  readonly derivedState: DerivedStateFn<any, any, any, any>;
  // TODO: Adding generics here messes up things
  readonly reducer: SliceReducer<any, any, any, any>;
  readonly lineageId: LineageId;
  effects: UnknownEffect[];
  actionBuilders: Record<string, ActionBuilder<any, TState, TDependency>>;
  beforeSlices?: UnknownSlice[];
  afterSlices?: UnknownSlice[];
}

export interface SliceConfig {
  /**
   * Freeze the slice so that no more transaction builders or effects can be registered.
   */
  frozen: boolean;
  disableEffects: boolean;
}

export class Slice<
  TName extends string,
  TState,
  TDependency extends string,
  TDerivedState,
> {
  // internal note: the name can be confusing as it is actually creating
  // a transaction builder. But this is just for the convenience of the user.
  static createAction<
    N extends string,
    TState,
    TDependency extends string,
    TDerivedState,
    TActionParam extends unknown[],
  >(
    slice: Slice<N, TState, TDependency, TDerivedState>,
    actionId: string,
    action: ActionBuilder<TActionParam, TState, TDependency>,
  ): TransactionBuilder<N, TActionParam> {
    // register the action so we can use it later
    // when applying transactions
    Slice.registerAction(slice, actionId, action);

    return (...params) => {
      return new Transaction({
        sourceSliceName: slice.spec.name,
        targetSliceLineage: slice.spec.lineageId,
        payload: params,
        actionId,
      });
    };
  }

  static disableEffects<
    N extends string,
    TState,
    TDependency extends string,
    TDerivedState,
  >(
    sl: Slice<N, TState, TDependency, TDerivedState>,
  ): Slice<N, TState, TDependency, TDerivedState> {
    return sl.fork({
      ...sl.config,
      disableEffects: true,
    });
  }

  static registerAction<
    N extends string,
    TState,
    TDependency extends string,
    TDerivedState,
    TActionParam extends unknown[],
  >(
    slice: Slice<N, TState, TDependency, TDerivedState>,
    actionId: string,
    action: ActionBuilder<TActionParam, TState, TDependency>,
  ): void {
    if (slice.config.frozen) {
      throw new Error(
        `Slice "${slice.spec.lineageId}" is frozen. Cannot register action "${actionId}"`,
      );
    }

    // set context detail to share some details with the action builder
    // Some uses: it uses thing information to serialize/parse the action
    action.setContextDetails?.({
      lineageId: slice.spec.lineageId,
      actionId,
    });

    if (slice.spec.actionBuilders[actionId]) {
      throw new Error(
        `Action "${actionId}" already registered for slice "${slice.spec.lineageId}"`,
      );
    }
    slice.spec.actionBuilders[actionId] = action;
  }

  static registerEffectSlice(slice: AnySlice, effectSlices: AnySlice[]): void {
    if (slice.config.frozen) {
      throw new Error(
        `Slice "${slice.spec.lineageId}" is frozen. Cannot register new effect slices`,
      );
    }

    if (!effectSlices.every((s) => s.spec.terminal)) {
      throw new Error(`All effect slices must be terminal slices.`);
    }

    Slice._registerInternalSlice(slice, {
      after: effectSlices,
    });
  }
  public readonly spec: SliceInputSpec<
    TName,
    TState,
    TDependency,
    TDerivedState
  >;
  public readonly config: SliceConfig;
  constructor(
    inputSpec: SliceInputSpec<TName, TState, TDependency, TDerivedState>,
    config: Partial<SliceConfig> = {},
  ) {
    if (inputSpec.dependencies.some((dep) => dep.spec.terminal)) {
      throw new Error(
        `A slice cannot have a dependency on a terminal slice. Remove "${
          inputSpec.dependencies.find((dep) => dep.spec.terminal)?.spec.name
        }" from the dependencies of "${inputSpec.name}".`,
      );
    }

    // spec stays the same across forks
    this.spec = inputSpec;

    // config can be changed across forks
    this.config = {
      frozen: false,
      disableEffects: false,
      ...config,
    };
    // find a better way, I feel weakCache might be slow
    this.resolveState = weakCache(this.resolveState.bind(this));
  }
  applyTx<TStoreSlices extends string>(
    sliceState: TState,
    storeState: ValidStoreState<TStoreSlices, TName>,
    tx: Transaction<TName, unknown[]>,
  ): TState {
    const action = this.spec.actionBuilders[tx.actionId];

    if (!action) {
      throw new Error(
        `Action "${tx.actionId}" not found in Slice "${this.spec.name}"`,
      );
    }

    return this.spec.reducer(sliceState, tx, action, storeState, this);
  }
  /**
   * Freeze the slice so that no more transaction builders or effects can be registered.
   */
  finalize(): Slice<TName, TState, TDependency, TDerivedState> {
    this.config.frozen = true;
    // Should we fork here?
    return this;
  }
  /**
   * @internal
   */
  protected fork(
    config: Partial<SliceConfig> = {},
  ): Slice<TName, TState, TDependency, TDerivedState> {
    return new Slice(this.spec, { ...this.config, ...config });
  }
  getDerivedState<TStateSlices extends string>(
    storeState: ValidStoreState<TStateSlices, TName>,
  ): TDerivedState {
    return StoreState.getDerivedState(storeState, this) as TDerivedState;
  }
  getState<TStateSlices extends string>(
    storeState: ValidStoreState<TStateSlices, TName>,
  ): TState {
    return StoreState.getSliceState(storeState, this) as TState;
  }
  /**
   * Ignore running the callback if this value changes. This is useful
   * when you want to just read the value and not trigger the effect if
   * it changes.
   */
  passivePick<T>(cb: (resolvedState: TState & TDerivedState) => T) {
    const opts: PickOpts = {
      ignoreChanges: true,
    };
    return this.pick(cb, opts);
  }
  pick<T>(
    cb: (resolvedState: TState & TDerivedState) => T,
    _opts: PickOpts = {},
  ): [
    Slice<TName, TState, TDependency, TDerivedState>,
    (storeState: StoreState<any>) => T,
    PickOpts,
  ] {
    return [
      this,
      (storeState: StoreState<any>) => {
        return cb(this.resolveState(storeState));
      },
      _opts,
    ];
  }

  resolveState<TStateSlices extends string>(
    storeState: ValidStoreState<TStateSlices, TName>,
  ): TState & TDerivedState {
    return {
      ...this.getState(storeState),
      ...this.getDerivedState(storeState),
    };
  }

  createAction<TActionParam extends unknown[]>(
    actionId: string,
    action: ActionBuilder<TActionParam, TState, TDependency>,
  ): TransactionBuilder<TName, TActionParam> {
    return Slice.createAction(this, actionId, action);
  }

  static _fork<TSlice extends AnySlice>(
    slice: TSlice,
    config?: Partial<SliceConfig>,
  ) {
    return slice.fork(config);
  }

  // TODO should be discouraged
  static _registerEffect<
    N extends string,
    TState,
    TDependency extends string,
    TDerivedState,
  >(
    slice: Slice<N, TState, TDependency, TDerivedState>,
    effect: Effect<N, TState, TDependency, TDerivedState>,
  ): void {
    if (slice.config.frozen) {
      throw new Error(
        `Slice "${slice.spec.lineageId}" is frozen. Cannot register new effect "${effect.name}"`,
      );
    }

    slice.spec.effects.push(effect as any);
  }

  /**
   * @internal
   */
  static _registerInternalSlice(
    slice: AnySlice,
    {
      before = [],
      after = [],
    }: {
      before?: AnySlice[];
      after?: AnySlice[];
    },
  ): void {
    slice.spec.afterSlices = [...(slice.spec.afterSlices || []), ...after];
    slice.spec.beforeSlices = [...(slice.spec.beforeSlices || []), ...before];
  }
}
