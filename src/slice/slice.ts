import { AnySlice, InferSliceNameFromSlice } from '../types';
import {
  Action,
  UserActionCallback,
  ActionBuilder as ActionBuilder,
} from '../action';
import type { StoreState } from '../store-state';
import { Transaction } from '../transaction';
import { BaseSlice, CreateSliceOpts, UserSliceOpts } from './base-slice';

export class Slice<
  TSliceName extends string,
  TState extends object,
  TDep extends string,
> extends BaseSlice<TSliceName, TState, TDep> {
  /**
   * @internal
   */
  static create<
    TSliceName extends string,
    TState extends object,
    TDepSlice extends Slice<string, any, any>,
  >(
    opts: CreateSliceOpts<
      TSliceName,
      TState,
      InferSliceNameFromSlice<TDepSlice>
    >,
  ): Slice<TSliceName, TState, InferSliceNameFromSlice<TDepSlice>> {
    return new Slice(opts);
  }

  private constructor(
    public readonly opts: CreateSliceOpts<TSliceName, TState, TDep>,
  ) {
    super(opts);
  }

  action<TParams extends any[]>(
    cb: UserActionCallback<TParams, ActionBuilder<any, any, any>>,
  ): (...params: TParams) => Transaction<TSliceName> {
    const action = new Action<TSliceName, TParams>({
      slice: this,
      userCallback: cb,
    });

    return action.getTransactionBuilder();
  }

  tx(
    calcSliceState: (storeState: StoreState<TSliceName | TDep>) => TState,
  ): ActionBuilder<TSliceName, TState, any> {
    return new ActionBuilder({
      name: this.name,
      calcUserSliceState: calcSliceState,
    });
  }

  //   TODO implement
  query<TParams extends any[], TQuery>(
    cb: (
      ...params: TParams
    ) => (storeState: StoreState<TSliceName | TDep>) => TQuery,
  ): (storeState: StoreState<TSliceName | TDep>, ...params: TParams) => TQuery {
    return cb as any;
  }
}

export function slice<
  TSliceName extends string,
  TState extends object,
  TDepSlice extends Slice<string, any, any>,
>(
  dependencies: TDepSlice[],
  opts: Omit<
    UserSliceOpts<TSliceName, TState, InferSliceNameFromSlice<TDepSlice>>,
    'dependencies'
  >,
): Slice<TSliceName, TState, InferSliceNameFromSlice<TDepSlice>> {
  return Slice.create<TSliceName, TState, AnySlice>({ ...opts, dependencies });
}
