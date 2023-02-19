import { mapObjectValues, uuid, weakCache } from './helpers';
import { AnyFn, NoInfer, TxApplicator } from './internal-types';
import {
  Effect,
  SelectorFn,
  Action,
  AnySlice,
  TxCreator,
} from './public-types';
import { StoreState } from './state';
import { Transaction } from './transaction';

let sliceUidCounter = 0;
let fileUid = uuid(4);

type IfSliceRegistered<
  SState extends StoreState<any>,
  K extends string,
  Result,
> = SState extends StoreState<infer SL>
  ? K extends SL['key']
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
    children?: BareSlice[];
  };

  applyTx(
    sliceState: SS,
    storeState: StoreState<any>,
    tx: Transaction<K, unknown[]>,
  ): SS;

  keyMapping(key: string): string;
}

interface SliceConfig {
  lineageId: string;
  modifiedKey?: string;

  originalSpec: SliceSpec<any, any, any, any, any>;
}

export interface SliceSpec<
  K extends string,
  SS,
  DS extends AnySlice,
  A extends Record<string, Action<any[], SS, DS>>,
  SE extends Record<string, SelectorFn<SS, DS, any>>,
> {
  key: K;
  dependencies: DS[];
  initState: SS;
  actions: A;
  selectors: SE;
  effects?: Effect<Slice<K, SS, DS, A, SE>, DS | Slice<K, SS, DS, A, SE>>[];
  children?: AnySlice[];
}

export class Slice<
  K extends string,
  SS,
  DS extends AnySlice,
  A extends Record<string, Action<any[], SS, DS>>,
  SE extends Record<string, SelectorFn<SS, DS, any>>,
> implements BareSlice<K, SS>
{
  public readonly initState: SS;
  public readonly key: K;
  public readonly originalKey: string;
  public readonly lineageId: string;

  public readonly keyMap: KeyMap;

  get a() {
    return this.actions;
  }

  get actions(): ActionsToTxCreator<K, A> {
    return this.txCreators as any;
  }

  get selectors(): SE {
    return this.spec.selectors;
  }

  private txCreators: Record<string, TxCreator>;
  private txApplicators: Record<string, TxApplicator<string, any>>;

  constructor(
    public readonly spec: SliceSpec<K, SS, DS, A, SE>,
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
    storeState: IfSliceRegistered<SState, K, SState>,
  ): IfSliceRegistered<SState, K, SS> {
    return storeState.getSliceState(this as any);
  }

  resolveSelectors<SState extends StoreState<any>>(
    storeState: IfSliceRegistered<SState, K, SState>,
  ): ResolvedSelectors<SE> {
    const result = mapObjectValues(this.spec.selectors, (selector) => {
      return selector(this.getState(storeState), storeState);
    });

    return result as any;
  }

  resolveState<SState extends StoreState<any>>(
    storeState: IfSliceRegistered<SState, K, SState>,
  ): SS & ResolvedSelectors<SE> {
    return {
      ...this.getState(storeState),
      ...this.resolveSelectors(storeState),
    };
  }

  applyTx(
    sliceState: SS,
    storeState: StoreState<any>,
    tx: Transaction<K, unknown[]>,
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
    cb: (resolvedState: SS & ResolvedSelectors<SE>) => T,
  ): [Slice<K, SS, DS, A, SE>, (storeState: StoreState<any>) => T] {
    return [
      this,
      (storeState: StoreState<any>) => {
        return cb(this.resolveState(storeState));
      },
    ];
  }

  _fork(
    spec: Partial<SliceSpec<any, any, any, any, any>>,
  ): Slice<K, SS, DS, A, SE> {
    return new Slice(
      {
        ...this.spec,
        ...spec,
      },
      this.config,
    );
  }

  keyMapping(key: string): string {
    return this.keyMap.resolve(key) || key;
  }
}

export type ActionsToTxCreator<
  K extends string,
  A extends Record<string, Action<any[], any, any>>,
> = {
  [KK in keyof A]: A[KK] extends (...param: infer P) => any
    ? TxCreator<K, P>
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
  resolve(key: string): string | undefined {
    return this.map[key];
  }
}
