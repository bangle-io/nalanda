import { StoreState } from './store-state';
import { Transaction } from './transaction';

export type CreateSliceOpts<
  TSliceName extends string,
  TState extends object,
  TDep extends string,
> = {
  name: TSliceName;
  state: TState;
  dependencies: Slice<TDep, any, any>[];
};

type SliceAction<TSliceName extends string, TParams extends any[]> = (
  ...params: TParams
) => Transaction<TSliceName, TParams>;

export abstract class SliceBase<
  TSliceName extends string,
  TState extends object,
  TDep extends string,
> {
  readonly name: TSliceName;
  readonly initialState: TState;
  readonly dependencies: Slice<TDep, any, any>[];

  constructor(opts: CreateSliceOpts<TSliceName, TState, TDep>) {
    this.name = opts.name;
    this.initialState = opts.state;
    this.dependencies = opts.dependencies;
  }

  update(
    storeState: StoreState,
    updater: ((cur: TState) => Partial<TState>) | Partial<TState>,
    opts: { replace?: boolean } = {},
  ): TState {
    // TODO implement
    // Notes
    //  - if replace is true, replace the provided state
    //    with the new state.
    //  - if replace is false, merge the provided state
    //  - ? figure out ignoring of selector properties
    return {} as any;
  }
}

export class Slice<
  TSliceName extends string,
  TState extends object,
  TDep extends string,
> extends SliceBase<TSliceName, TState, TDep> {
  static create<
    TSliceName extends string,
    TState extends object,
    TDep extends string,
  >(
    dependencies: Slice<TDep, any, any>[],
    opts: Omit<CreateSliceOpts<TSliceName, TState, TDep>, 'dependencies'>,
  ): Slice<TSliceName, TState, TDep> {
    return new Slice<TSliceName, TState, TDep>({
      ...opts,
      dependencies: dependencies,
    });
  }
  private constructor(
    public readonly opts: CreateSliceOpts<TSliceName, TState, TDep>,
  ) {
    super(opts);
  }

  action<TParams extends any[]>(
    ...params: TParams
  ): SliceAction<TSliceName, TParams> {
    return {} as any;
  }

  tx(
    cb: (storeState: StoreState) => TState,
  ): Transaction<TSliceName, unknown[]> {
    return new Transaction<TSliceName, unknown[]>();
  }

  //   TODO implement
  query<TParams extends any[], TQuery>(
    cb: (...params: TParams) => (storeState: StoreState) => TQuery,
  ): (storeState: StoreState, ...params: TParams) => TQuery {
    return {} as any;
  }
}

export const slice = Slice.create.bind(Slice);

// TESTs
let sliceA = slice([], {
  name: 'hi2',
  state: {
    a: 1,
  },
});

let sliceB = slice([], {
  name: 'hi3',
  state: {
    a: 1,
  },
});

let sliceC = slice([sliceA, sliceB], {
  name: 'hiC',
  state: {
    a: 1,
  },
});
