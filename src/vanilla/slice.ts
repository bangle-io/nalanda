import { mapObjectValues, uuid, weakCache } from './helpers';
import {
  AnyFn,
  createLineageId,
  createSliceKey,
  createSliceNameOpaque,
  isSliceKey,
  KEY_PREFIX,
  LineageId,
  NoInfer,
  SliceContext,
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
import { InternalStoreState, StoreState } from './state';
import { Transaction } from './transaction';
import type { Simplify } from 'type-fest';

let sliceUidCounter = 0;
let fileUid = uuid(4);

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
    _additionalSlices?: BareSlice[];
  };

  applyTx(
    sliceState: SS,
    storeState: StoreState<any>,
    tx: Transaction<K, unknown[]>,
  ): SS;

  readonly keyMap: KeyMap;
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
  SE extends Record<string, SelectorFn<SS, DS, any>>,
> {
  name: N;
  dependencies: DS[];
  initState: SS;
  actions: A;
  reducer: (
    sliceState: NoInfer<SS>,
    storeState: StoreState<NoInfer<DS>>,
    // adding N breaks things
    tx: Transaction<string, any[]>,
  ) => NoInfer<SS>;
  selectors: SE;
  terminal?: boolean;
  effects?: Effect<N, SS, DS, A, SE>[];
  // used internally by mergeSlices
  _additionalSlices?: AnySlice[];
}

export class Slice<
  N extends string,
  SS,
  DS extends AnySlice,
  A extends Record<string, TxCreator<N, any[]>>,
  SE extends Record<string, SelectorFn<SS, DS, any>>,
> implements BareSlice<N, SS>
{
  public readonly initState: SS;
  public readonly name: N;
  public readonly nameOpaque: SliceNameOpaque;
  public readonly lineageId: LineageId;
  public readonly keyMap: KeyMap;
  public key: SliceKey;
  public _metadata: Record<string | symbol, any> = {};

  actions: A;

  get a() {
    return this.actions;
  }

  get selectors(): SE {
    return this.spec.selectors;
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

    this.resolveSelectors = weakCache(this.resolveSelectors.bind(this));
    this.resolveState = weakCache(this.resolveState.bind(this));

    this.initState = spec.initState;

    this.lineageId = this.config.lineageId;
    this.keyMap = new KeyMap(
      {
        key: this.key,
        sliceName: this.nameOpaque,
      },
      spec.dependencies,
    );

    this.actions = spec.actions;
  }

  getState<SState extends StoreState<any>>(
    storeState: IfSliceRegistered<SState, N, SState>,
  ): IfSliceRegistered<SState, N, SS> {
    const { context, sliceLookupByKey } =
      storeState as unknown as InternalStoreState;

    const resolvedSlice: any = resolveSliceInContext(
      this as AnySlice,
      sliceLookupByKey,
      context,
    );

    return storeState.getSliceState(resolvedSlice);
  }

  resolveSelectors<SState extends StoreState<any>>(
    storeState: IfSliceRegistered<SState, N, SState>,
  ): ResolvedSelectors<SE> {
    const result = mapObjectValues(this.spec.selectors, (selector) => {
      return selector(this.getState(storeState), storeState);
    });

    return result as any;
  }

  resolveState<SState extends StoreState<any>>(
    storeState: IfSliceRegistered<SState, N, SState>,
  ): Simplify<SS & ResolvedSelectors<SE>> {
    return {
      ...this.getState(storeState),
      ...this.resolveSelectors(storeState),
    };
  }

  applyTx(
    sliceState: SS,
    storeState: StoreState<any>,
    tx: Transaction<N, unknown[]>,
  ): SS {
    return this.spec.reducer(sliceState, storeState, tx);

    // if (!apply) {
    //   throw new Error(
    //     `Action "${tx.actionId}" not found in Slice "${this.key}"`,
    //   );
    // }

    // return apply(sliceState, storeState, tx);
  }

  /**
   * Ignore running the callback if this value changes. This is useful
   * when you want to just read the value and not trigger the effect if
   * it changes.
   */
  passivePick<T>(
    cb: (resolvedState: Simplify<SS & ResolvedSelectors<SE>>) => T,
  ) {
    const opts: PickOpts = {
      ignoreChanges: true,
    };
    return this.pick(cb, opts);
  }

  pick<T>(
    cb: (resolvedState: Simplify<SS & ResolvedSelectors<SE>>) => T,
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
}

export type ActionBuilderToTxCreator<
  N extends string,
  A extends Record<string, ActionBuilder<any[], any, any>>,
> = {
  [KK in keyof A]: A[KK] extends (...param: infer P) => any
    ? TxCreator<N, P>
    : never;
};

type ResolvedSelectors<SE extends Record<string, SelectorFn<any, any, any>>> = {
  [K in keyof SE]: SE[K] extends AnyFn ? ReturnType<SE[K]> : never;
};

export class KeyMap {
  public readonly sliceKey: string;
  private map: Record<SliceNameOpaque, SliceKey>;

  constructor(
    slice: { key: SliceKey; sliceName: SliceNameOpaque },
    dependencies: AnySlice[],
  ) {
    this.sliceKey = slice.key;

    this.map = Object.fromEntries(
      dependencies.map((dep) => [dep.name, dep.key]),
    );
    this.map[slice.sliceName] = slice.key;
  }

  // resolves original name to current key
  resolve(name: SliceNameOpaque): SliceKey | undefined {
    return this.map[name];
  }
}

// if this was called from
// sliceA.getState(storeState)
// we need to first find the possible context this was executed in
// by looking at storeContext
// next we need find how to resolve the current sliceA in this context.
// TODO add tests
export function resolveSliceInContext(
  currentSlice: AnySlice,
  sliceLookupByKey: Record<SliceKey, BareSlice>,
  context?: SliceContext,
): BareSlice {
  const sliceKey = context?.sliceKey;

  if (!sliceKey || sliceKey === currentSlice.key) {
    return currentSlice;
  }

  const sourceSlice = sliceLookupByKey[sliceKey];

  if (!sourceSlice) {
    throw new Error(`Slice "${sliceKey}" not found in store state`);
  }
  const resolvedKey = sourceSlice.keyMap.resolve(currentSlice.nameOpaque);
  const mappedSlice = resolvedKey
    ? sliceLookupByKey[resolvedKey]
    : currentSlice;

  if (!mappedSlice) {
    throw new Error(`Mapped slice "${resolvedKey}" not found in store state`);
  }

  return mappedSlice;
}
