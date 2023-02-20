import { mapObjectValues, uuid, weakCache } from './helpers';
import { AnyFn, SliceContext, SliceKey, TxApplicator } from './internal-types';
import {
  Effect,
  SelectorFn,
  Action,
  AnySlice,
  TxCreator,
} from './public-types';
import { InternalStoreState, StoreState } from './state';
import { Transaction } from './transaction';
import type { Simplify } from 'type-fest';

export interface ActionPayload<K extends string, P extends unknown[]> {
  sliceKey: K;
  payload: P;
}

let sliceUidCounter = 0;
let fileUid = uuid(4);

type IfSliceRegistered<
  SState extends StoreState<any>,
  N extends string,
  Result,
> = SState extends StoreState<infer SL>
  ? N extends SL['key']
    ? Result
    : never
  : never;

function actionsToTxCreators(
  key: string,
  actions: Record<string, Action<any[], any, any>>,
) {
  return mapObjectValues(actions, (action, actionId): TxCreator => {
    return (...params) => {
      return new Transaction(key, params, actionId);
    };
  });
}

export interface BareSlice<K extends string = any, SS = any> {
  readonly key: K;
  readonly lineageId: string;
  //   Duplicated for ease of doing BareSlice['initState'] type
  readonly initState: SS;

  readonly spec: {
    key: K;
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
  lineageId: string;
  originalSpec: SliceSpec<any, any, any, any, any>;
}

export interface SliceSpec<
  N extends string,
  SS,
  DS extends AnySlice,
  A extends Record<string, Action<any[], SS, DS>>,
  SE extends Record<string, SelectorFn<SS, DS, any>>,
> {
  key: N;
  dependencies: DS[];
  initState: SS;
  actions: A;
  selectors: SE;
  effects?: Effect<Slice<N, SS, DS, A, SE>, DS | Slice<N, SS, DS, A, SE>>[];
  // used internally by mergeSlices
  _additionalSlices?: AnySlice[];
}

export class Slice<
  N extends string,
  SS,
  DS extends AnySlice,
  A extends Record<string, Action<any[], SS, DS>>,
  SE extends Record<string, SelectorFn<SS, DS, any>>,
> implements BareSlice<N, SS>
{
  public readonly initState: SS;
  public readonly key: N;
  public readonly originalKey: string;
  public readonly lineageId: string;
  public readonly keyMap: KeyMap;

  public _metadata: Record<string | symbol, any> = {};

  get a() {
    return this.actions;
  }

  get actions(): ActionsToTxCreator<N, A> {
    return this.txCreators as any;
  }

  get selectors(): SE {
    return this.spec.selectors;
  }

  private txCreators: Record<string, TxCreator>;
  private txApplicators: Record<string, TxApplicator<string, any>>;

  constructor(
    public readonly spec: SliceSpec<N, SS, DS, A, SE>,
    public readonly config: SliceConfig = {
      originalSpec: spec,
      lineageId: `${spec.key}-${fileUid}-${sliceUidCounter++}`,
    },
  ) {
    const key = spec.key;

    this.resolveSelectors = weakCache(this.resolveSelectors.bind(this));
    this.resolveState = weakCache(this.resolveState.bind(this));

    this.initState = spec.initState;
    this.key = key;
    this.originalKey = this.config.originalSpec.key;
    this.lineageId = this.config.lineageId;

    this.keyMap = new KeyMap(
      {
        key,
        originalKey: this.originalKey,
      },
      spec.dependencies,
    );

    this.txCreators = actionsToTxCreators(key, spec.actions);
    this.txApplicators = mapObjectValues(
      spec.actions,
      (action, actionId): TxApplicator<string, any> => {
        return (sliceState, storeState, tx) => {
          return action(...tx.payload)(sliceState, storeState);
        };
      },
    );
  }

  getState<SState extends StoreState<any>>(
    storeState: IfSliceRegistered<SState, N, SState>,
  ): IfSliceRegistered<SState, N, SS> {
    const { context, sliceLookupByKey } =
      storeState as unknown as InternalStoreState;

    const resolvedSlice = resolveSliceInContext(
      this,
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
    const apply = this.txApplicators[tx.actionId];

    if (!apply) {
      throw new Error(
        `Action "${tx.actionId}" not found in Slice "${this.key}"`,
      );
    }

    return apply(sliceState, storeState, tx);
  }

  pick<T>(
    cb: (resolvedState: Simplify<SS & ResolvedSelectors<SE>>) => T,
  ): [Slice<N, SS, DS, A, SE>, (storeState: StoreState<any>) => T] {
    return [
      this,
      (storeState: StoreState<any>) => {
        return cb(this.resolveState(storeState));
      },
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
}

export type ActionsToTxCreator<
  N extends string,
  A extends Record<string, Action<any[], any, any>>,
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
  private map: Record<string, string>;

  constructor(
    slice: { key: string; originalKey: string },
    dependencies: AnySlice[],
  ) {
    this.sliceKey = slice.key;

    this.map = Object.fromEntries(
      dependencies.map((dep) => [dep.originalKey, dep.key]),
    );
    this.map[slice.originalKey] = slice.key;
  }

  // resolves original key to current key
  resolve(key: string): string {
    return this.map[key] || key;
  }
}

// if this was called from
// sliceA.getState(storeState)
// we need to first find the possible context this was executed in
// by looking at storeContext
// next we need find how to resolve the current sliceA in this context.
// TODO add tests
export function resolveSliceInContext(
  currentSlice: BareSlice,
  sliceLookupByKey: Record<SliceKey, BareSlice>,
  context?: SliceContext,
): BareSlice {
  const sourceSliceKey = context?.sliceKey;

  if (!sourceSliceKey || sourceSliceKey === currentSlice.key) {
    return currentSlice;
  }

  const sourceSlice = sliceLookupByKey[sourceSliceKey];

  if (!sourceSlice) {
    throw new Error(`Slice "${sourceSliceKey}" not found in store state`);
  }
  const resolvedKey = sourceSlice.keyMap.resolve(currentSlice.key);
  const mappedSlice = sliceLookupByKey[resolvedKey];

  if (!mappedSlice) {
    throw new Error(`Mapped slice "${resolvedKey}" not found in store state`);
  }

  return mappedSlice;
}
