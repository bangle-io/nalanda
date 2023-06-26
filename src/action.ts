import { StoreState } from './store-state';
import { Slice } from './slice';
import { Transaction } from './transaction';

export type UserActionCallback<
  TSliceName extends string,
  TParams extends any[],
> = (...params: TParams) => ActionBuilder<TSliceName, any, any>;

export type ActionOpts<TSliceName extends string, TParams extends any[]> = {
  slice: Slice<TSliceName, any, any>;
  userCallback: UserActionCallback<TSliceName, TParams>;
};

export class Action<TSliceName extends string, TParams extends any[]> {
  constructor(private opts: ActionOpts<TSliceName, TParams>) {}

  callable(): (...params: TParams) => Transaction<TSliceName, TParams> {
    return (...params) => {
      const sliceStateBuilder = this.opts.userCallback(...params);
      return sliceStateBuilder.makeTxn(...params);
    };
  }
}

// This is built new every time user calls mySliceAction({x:2})
export class ActionBuilder<
  TSliceName extends string,
  TState extends object,
  TDep extends string,
> {
  constructor(
    private opts: {
      name: TSliceName;
      calcSliceState: (storeState: StoreState<TSliceName | TDep>) => TState;
    },
  ) {}

  makeTxn<TParams extends any[]>(
    ...params: TParams
  ): Transaction<TSliceName, TParams> {
    return new Transaction({
      name: this.opts.name,
      params: params,
    });
  }
}
