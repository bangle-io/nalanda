import { mapObjectValues, weakCache } from './helpers';
import { AnyFn, TxApplicator } from './internal-types';
import type { KeyMapping } from './state';
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
  //   Duplicated for ease of doing BareSlice['initState'] type
  readonly initState: SS;
  // Internal things are here
  readonly _bare: Readonly<{
    txCreators: Record<string, TxCreator>;
    txApplicators: Record<string, TxApplicator<string, any>>;
    children?: BareSlice[];
    siblingAndDependencies?: string[];
    siblingAndDependenciesAccessModifier?: string;
    mappedDependencies: Record<string, BareSlice>;
    keyMapping?: KeyMapping;
    reverseKeyMapping?: KeyMapping;
  }>;

  readonly config: {
    dependencies: BareSlice[];
    // Adding effects breaks everything
    effects?: any[];
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

    const txCreators: Record<string, TxCreator> = actionsToTxCreators(
      key,
      config.actions,
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

    const mappedDependencies = Object.fromEntries(
      config.dependencies.map((d) => [d.key, d]),
    );

    this._bare = {
      txCreators,
      txApplicators,
      mappedDependencies,
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
    slice: Slice<string, any, AnySlice, any, any>,
    parentKey: string,
    siblingKeys: string[],
  ): AnySlice {
    let siblingAndDependencies = slice._bare.siblingAndDependencies;
    if (!siblingAndDependencies) {
      const depKeys = new Set(slice.config.dependencies.map((d) => d.key));
      siblingAndDependencies = siblingKeys.filter((k) => depKeys.has(k));
    }

    const newKey = parentKey + ':' + slice.key;

    const siblingAndDependenciesAccessModifier = [
      parentKey,
      slice._bare.siblingAndDependenciesAccessModifier,
    ]
      .filter(Boolean)
      .join(':');

    const txCreators = actionsToTxCreators(slice.key, slice.config.actions);

    const keyMapping = (key: string): string => {
      if (!siblingAndDependencies) {
        throw new Error('siblingAndDependencies not set');
      }

      if (siblingAndDependencies.includes(key)) {
        return siblingAndDependenciesAccessModifier + ':' + key;
      }
      return key;
    };
    return slice._fork(
      { key: newKey },
      {
        siblingAndDependencies,
        siblingAndDependenciesAccessModifier,
        keyMapping,

        mappedDependencies: Object.fromEntries(
          slice.config.dependencies.map((d: BareSlice): [string, BareSlice] => {
            return [keyMapping(d.key), d];
          }),
        ),

        txCreators: mapObjectValues(txCreators, (fn): TxCreator => {
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
