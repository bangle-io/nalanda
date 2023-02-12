import { mapObjectValues } from './helpers';
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
  key: K;
  //   Duplicated for ease of doing BareSlice['initState'] type
  initState: SS;
  // Internal things are here
  _bare: {
    dependencies: AnySlice[];
    keyMapping: KeyMapping;
    txCreators: Record<string, TxCreator>;
    txApplicators: Record<string, TxApplicator<string, any>>;
  };
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
  public readonly _bare: BareSlice<K, SS>['_bare'];

  constructor(public readonly config: SliceConfig<K, SS, DS, A, SE>) {
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
      dependencies: config.dependencies,
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

  actions!: ActionsToTxCreator<K, A>;
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
