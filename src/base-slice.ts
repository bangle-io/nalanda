import { LineageId, createLineageId } from './helpers';
import type { Slice } from './slice';
import type { StoreState } from './store-state';

export type CreateSliceOpts<
  TSliceName extends string,
  TState extends object,
  TDep extends string,
> = {
  name: TSliceName;
  state: TState;
  dependencies: Slice<TDep, any, any>[];
};

export type ValidStoreState<
  TStoreSlices extends string,
  TSliceName extends string,
> = TSliceName extends TStoreSlices ? StoreState<TStoreSlices> : never;

export abstract class BaseSlice<
  TSliceName extends string,
  TState extends object,
  TDep extends string,
> {
  readonly name: TSliceName;
  readonly initialState: TState;
  readonly dependencies: Slice<TDep, any, any>[];

  readonly lineageId: LineageId;

  constructor(opts: CreateSliceOpts<TSliceName, TState, TDep>) {
    this.name = opts.name;
    this.initialState = opts.state;
    this.dependencies = opts.dependencies;
    this.lineageId = createLineageId(opts.name);
  }

  get<TStoreSlices extends string>(
    storeState: ValidStoreState<TStoreSlices, TSliceName>,
  ): TState {
    // TODO implement
    return {} as any;
  }

  update<TStoreSlices extends string>(
    storeState: ValidStoreState<TStoreSlices, TSliceName>,
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
