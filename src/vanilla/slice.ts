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
let fileUid = uuid(5);

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
  readonly uid: string;

  //   Duplicated for ease of doing BareSlice['initState'] type
  readonly initState: SS;
  // Internal things are here
  // This carried forward in forks
  readonly _bare: Readonly<{
    children: BareSlice[];
    mappedDependencies: BareSlice[];
    siblingSliceUids?: Set<string>;
  }>;

  readonly spec: {
    key: K;
    dependencies: BareSlice[];
    // Adding effects breaks everything
    effects?: any[];
  };

  applyTx(
    sliceState: SS,
    storeState: StoreState<any>,
    tx: Transaction<K, unknown[]>,
  ): SS;

  keyMapping(key: string): string;
}

interface SliceInternalOpts {
  uid?: string;
  modifiedKey?: string;
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
}

export class Slice<
  K extends string,
  SS,
  DS extends AnySlice,
  A extends Record<string, Action<any[], SS, DS>>,
  SE extends Record<string, SelectorFn<SS, DS, any>>,
> implements BareSlice<K, SS>
{
  private txCreators: Record<string, TxCreator>;

  private txApplicators: Record<string, TxApplicator<string, any>>;
  public readonly key: K;
  public readonly initState: SS;

  // This carried forward in forks
  public _bare: BareSlice<K, SS>['_bare'];

  public readonly uid: string;

  constructor(
    // config  & uid always stays the same for all the forks
    public readonly spec: SliceSpec<K, SS, DS, A, SE>,
    _internalOpts?: SliceInternalOpts,
  ) {
    // key can be modified by the fork
    const key = (_internalOpts?.modifiedKey ?? spec.key) as K;
    this.uid = _internalOpts?.uid ?? `${fileUid}-${sliceUidCounter++}`;

    this.resolveSelectors = weakCache(this.resolveSelectors.bind(this));
    this.resolveState = weakCache(this.resolveState.bind(this));

    this.key = key;
    this.initState = spec.initState;

    this.txCreators = actionsToTxCreators(key, spec.actions);

    this.txApplicators = mapObjectValues(
      spec.actions,
      (action, actionId): TxApplicator<string, any> => {
        return (sliceState, storeState, tx) => {
          return action(...tx.payload)(sliceState, storeState);
        };
      },
    );

    this._bare = {
      mappedDependencies: spec.dependencies,
      children: [],
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

  get a() {
    return this.actions;
  }

  get actions(): ActionsToTxCreator<K, A> {
    return this.txCreators as any;
  }

  get selectors(): SE {
    return this.spec.selectors;
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
    bare: Partial<Slice<K, SS, any, any, any>['_bare']>,
    internalOpts?: SliceInternalOpts,
  ): Slice<K, SS, DS, A, SE> {
    const newInternalOpts = {
      ...internalOpts,
      // uid is always the same for all the forks
      uid: this.uid,
    };

    // TODO: fix this
    if (this.key !== this.spec.key || internalOpts?.modifiedKey) {
      newInternalOpts.modifiedKey = internalOpts?.modifiedKey || this.key;
    }

    const slice = new Slice(this.spec, newInternalOpts);
    slice._bare = { ...slice._bare, ...this._bare, ...bare };

    return slice;
  }

  keyMapping(key: string): string {
    let match = this._bare.mappedDependencies.find(
      (dep) => dep.spec.key === key,
    );
    if (match) {
      return match.key;
    }
    // TODO throw error if not in dependencies

    return key;
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
