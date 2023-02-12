import { mapObjectValues, weakCache } from './helpers';
import { AnyFn, TxApplicator } from './internal-types';
import { KeyMapping } from './merge';
import {
  Effect,
  SelectorFn,
  Action,
  AnySlice,
  TxCreator,
} from './public-types';
import { StoreState } from './state';
import { Transaction } from './transaction';

type IfSliceRegistered<
  SState extends StoreState<any>,
  K extends string,
  Result,
> = SState extends StoreState<infer SL>
  ? K extends SL['key']
    ? Result
    : never
  : never;

export interface BareSlice<K extends string = any, SS = any> {
  readonly key: K;
  //   Duplicated for ease of doing BareSlice['initState'] type
  readonly initState: SS;
  // Internal things are here
  readonly _bare: Readonly<{
    keyMapping: KeyMapping;
    txCreators: Record<string, TxCreator>;
    txApplicators: Record<string, TxApplicator<string, any>>;
  }>;

  readonly config: {
    dependencies: BareSlice[];
  };

  applyTx(
    sliceState: SS,
    storeState: StoreState<any>,
    tx: Transaction<K, unknown[]>,
  ): SS;
}

export interface SliceConfig<
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
}

export class Slice<
  K extends string,
  SS,
  DS extends AnySlice,
  A extends Record<string, Action<any[], SS, DS>>,
  SE extends Record<string, SelectorFn<SS, DS, any>>,
> implements BareSlice<K, SS>
{
  public readonly key: K;
  public readonly initState: SS;

  // This to expose internally
  public _bare: BareSlice<K, SS>['_bare'];

  constructor(public readonly config: SliceConfig<K, SS, DS, A, SE>) {
    this.resolveSelectors = weakCache(this.resolveSelectors.bind(this));
    this.resolveState = weakCache(this.resolveState.bind(this));

    const key = config.key;
    this.key = key;
    this.initState = config.initState;

    const keys: [string, string][] = config.dependencies.map((k) => [
      k.key,
      k.key,
    ]);
    // add self to key mapping
    keys.push([key, key]);

    const keyMapping = new KeyMapping(Object.fromEntries(keys));
    const txCreators: Record<string, TxCreator> = mapObjectValues(
      config.actions,
      (action, actionId): TxCreator => {
        return (...params) => {
          return new Transaction(key, params, actionId);
        };
      },
    );
    const txApplicators: Record<
      string,
      TxApplicator<string, any>
    > = mapObjectValues(
      config.actions,
      (action, actionId): TxApplicator<string, any> => {
        return (sliceState, storeState, tx) => {
          return action(...tx.payload)(sliceState, storeState);
        };
      },
    );

    this._bare = {
      keyMapping,
      txCreators,
      txApplicators,
    };
  }

  getState<SState extends StoreState<any>>(
    storeState: IfSliceRegistered<SState, K, SState>,
  ): IfSliceRegistered<SState, K, SS> {
    return storeState.getSliceState(this as any);
  }

  resolveSelectors<SState extends StoreState<any>>(
    storeState: IfSliceRegistered<SState, K, SState>,
  ): ResolvedSelectors<SE> {
    const result = mapObjectValues(this.config.selectors, (selector) => {
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

  get actions(): ActionsToTxCreator<K, A> {
    return this._bare.txCreators as any;
  }

  get selectors(): SE {
    return this.config.selectors;
  }

  applyTx(
    sliceState: SS,
    storeState: StoreState<any>,
    tx: Transaction<K, unknown[]>,
  ): SS {
    const apply = this._bare.txApplicators[tx.actionId];

    if (!apply) {
      throw new Error(
        `Action "${tx.actionId}" not found in Slice "${this.key}"`,
      );
    }

    return apply(sliceState, storeState, tx);
  }

  _fork(
    config: Partial<SliceConfig<K, SS, DS, A, SE>>,
    bare?: Partial<Slice<K, SS, any, any, any>['_bare']>,
  ): Slice<K, SS, DS, A, SE> {
    const slice = new Slice({ ...this.config, ...config });
    if (bare) {
      slice._bare = { ...slice._bare, ...bare };
    }
    return slice;
  }

  static _addToParent(
    slice: AnySlice,
    parentKey: string,
    childrenKeys: string[],
  ): AnySlice {
    const newMapping = slice._bare.keyMapping.augment(parentKey, childrenKeys);
    const newKey = newMapping.get(slice.key);
    if (!newKey) {
      throw new Error('Slice key not found in mapping');
    }

    const existingCreators = slice._bare.txCreators;

    return slice._fork(
      { key: newKey },
      {
        keyMapping: newMapping,
        txCreators: mapObjectValues(existingCreators, (fn): TxCreator => {
          return (...params: unknown[]) => {
            return fn(...params).changeKey(newKey);
          };
        }),
      },
    );
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
