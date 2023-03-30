import { weakCache } from './helpers';
import {
  createLineageId,
  createSliceKey,
  createSliceNameOpaque,
  isSliceKey,
  KEY_PREFIX,
  LineageId,
  NoInfer,
  SliceKey,
  SliceNameOpaque,
} from './internal-types';
import {
  Effect,
  SelectorFn,
  ActionBuilder,
  AnySlice,
  TxCreator,
} from './public-types';
import { StoreState } from './state';
import { Transaction } from './transaction';
import type { Simplify } from 'type-fest';

type IfSliceRegistered<
  SState extends StoreState<any>,
  N extends string,
  Result,
> = SState extends StoreState<infer SL>
  ? N extends SL['name']
    ? Result
    : never
  : never;

export type PickOpts = {
  ignoreChanges?: boolean;
};

export interface BareSlice<K extends string = string, SS = unknown> {
  readonly name: K;
  readonly key: SliceKey;
  readonly lineageId: LineageId;
  //   Duplicated for ease of doing BareSlice['initState'] type
  readonly initState: SS;

  readonly spec: {
    name: K;
    dependencies: BareSlice[];
    // Adding effects breaks everything
    effects?: any[];
    beforeSlices?: BareSlice[];
    afterSlices?: BareSlice[];
  };

  applyTx(
    sliceState: SS,
    storeState: StoreState<any>,
    tx: Transaction<K, unknown[]>,
  ): SS;
}

interface SliceConfig {
  lineageId: LineageId;
  originalSpec: SliceSpec<any, any, any, any, any>;
}

export interface SliceSpec<
  N extends string,
  SS,
  DS extends AnySlice,
  A extends Record<string, TxCreator<N, any[]>>,
  SE extends SelectorFn<SS, DS, any>,
> {
  name: N;
  dependencies: DS[];
  initState: SS;
  actions: A | ((obj: { lineageId: LineageId }) => A);
  reducer: (
    sliceState: NoInfer<SS>,
    storeState: StoreState<NoInfer<DS>>,
    // adding N breaks things
    tx: Transaction<string, any[]>,
  ) => NoInfer<SS>;
  selector: SE;
  terminal?: boolean;
  forwardMap?: Record<string, LineageId>;
  effects?: Effect<N, SS, DS, A, SE>[];
  beforeSlices?: AnySlice[];
  afterSlices?: AnySlice[];
}

export class Slice<
  N extends string,
  SS,
  DS extends AnySlice,
  A extends Record<string, TxCreator<N, any[]>>,
  SE extends SelectorFn<SS, DS, any>,
> implements BareSlice<N, SS>
{
  public readonly initState: SS;
  public readonly name: N;
  public readonly nameOpaque: SliceNameOpaque;
  public readonly lineageId: LineageId;
  public key: SliceKey;
  public _metadata: Record<string | symbol, any> = {};

  actions: A;

  get a() {
    return this.actions;
  }

  get selector(): SE {
    return this.spec.selector;
  }

  constructor(
    public readonly spec: SliceSpec<N, SS, DS, A, SE>,
    public readonly config: SliceConfig = {
      originalSpec: spec,
      lineageId: createLineageId(spec.name),
    },
  ) {
    // can only set slice key as a name when forking
    if (config.originalSpec === spec && isSliceKey(spec.name)) {
      throw new Error(
        `Slice name cannot start with "${KEY_PREFIX}". Please use a different name for slice "${spec.name}"`,
      );
    }

    if (spec.dependencies.some((dep) => dep.spec.terminal)) {
      throw new Error(
        `A slice cannot have a dependency on a terminal slice. Remove "${
          spec.dependencies.find((dep) => dep.spec.terminal)?.spec.name
        }" from the dependencies of "${spec.name}".`,
      );
    }

    this.key = createSliceKey(this.spec.name);
    this.name = config?.originalSpec.name ?? spec.name;
    this.nameOpaque = createSliceNameOpaque(this.name);

    this.resolveSelector = weakCache(this.resolveSelector.bind(this));
    this.resolveState = weakCache(this.resolveState.bind(this));

    this.initState = spec.initState;

    this.lineageId = this.config.lineageId;

    this.actions =
      typeof spec.actions === 'function'
        ? spec.actions({ lineageId: this.lineageId })
        : spec.actions;
  }

  getState<SState extends StoreState<any>>(
    storeState: IfSliceRegistered<SState, N, SState>,
  ): IfSliceRegistered<SState, N, SS> {
    return storeState.getSliceState(this as AnySlice);
  }

  resolveSelector<SState extends StoreState<any>>(
    storeState: IfSliceRegistered<SState, N, SState>,
  ): ReturnType<SE> {
    if (typeof this.spec.selector !== 'function') {
      console.log(this.lineageId, this.spec.selector);
    }
    return this.spec.selector(this.getState(storeState), storeState);
  }

  resolveState<SState extends StoreState<any>>(
    storeState: IfSliceRegistered<SState, N, SState>,
  ): Simplify<SS & ReturnType<SE>> {
    // TODO this can fail if the selector returns not an object
    return {
      ...this.getState(storeState),
      ...this.resolveSelector(storeState),
    };
  }

  applyTx(
    sliceState: SS,
    storeState: StoreState<any>,
    tx: Transaction<N, unknown[]>,
  ): SS {
    return this.spec.reducer(sliceState, storeState, tx);
  }

  /**
   * Ignore running the callback if this value changes. This is useful
   * when you want to just read the value and not trigger the effect if
   * it changes.
   */
  passivePick<T>(cb: (resolvedState: Simplify<SS & ReturnType<SE>>) => T) {
    const opts: PickOpts = {
      ignoreChanges: true,
    };
    return this.pick(cb, opts);
  }

  pick<T>(
    cb: (resolvedState: Simplify<SS & ReturnType<SE>>) => T,
    _opts: PickOpts = {},
  ): [Slice<N, SS, DS, A, SE>, (storeState: StoreState<any>) => T, PickOpts] {
    return [
      this,
      (storeState: StoreState<any>) => {
        return cb(this.resolveState(storeState));
      },
      _opts,
    ];
  }

  _fork(
    spec: Partial<SliceSpec<any, any, any, any, any>>,
  ): Slice<N, SS, DS, A, SE> {
    let metadata = this._metadata;
    let newSlice = new Slice(
      {
        ...this.spec,
        ...spec,
      },
      this.config,
    );

    newSlice._metadata = metadata;

    return newSlice;
  }

  withoutEffects() {
    return this._fork({
      effects: [],
    });
  }

  addEffect(effects: Effect<N, SS, DS, A, SE> | Effect<N, SS, DS, A, SE>[]) {
    return this._fork({
      effects: [
        ...(this.spec.effects || []),
        ...(Array.isArray(effects) ? effects : [effects]),
      ],
    });
  }

  /**
   * Allows for registering of numerous slices in a way where they will be registered before/after the current slice in the store.
   * This is an advanced functionality to bundle misc slices which are self contained (externally not exposed)
   * and are not meant to be used directly by the user.
   * @returns
   */
  rollupSlices({
    before = [],
    after = [],
  }: {
    before?: AnySlice[];
    after?: AnySlice[];
  }) {
    return this._fork({
      beforeSlices: [...(this.spec.beforeSlices || []), ...before],
      afterSlices: [...(this.spec.afterSlices || []), ...after],
    });
  }
}

export type ActionBuilderToTxCreator<
  N extends string,
  A extends Record<string, ActionBuilder<any[], any, any>>,
> = {
  [KK in keyof A]: A[KK] extends (...param: infer P) => any
    ? TxCreator<N, P>
    : never;
};
