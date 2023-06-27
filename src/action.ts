import { StoreState } from './store-state';
import { Slice } from './slice';
import { Transaction } from './transaction';
import { ActionId, SliceId } from './helpers';
import { idGeneration } from './id_generation';

export type UserActionCallback<
  TSliceName extends string,
  TParams extends any[],
> = (...params: TParams) => ActionBuilder<TSliceName, any, any>;

export type ActionOpts<TSliceName extends string, TParams extends any[]> = {
  slice: Slice<TSliceName, any, any>;
  userCallback: UserActionCallback<TSliceName, TParams>;
};

const actionRegistry = new Map<ActionId, Action<any, any>>();

export class Action<TSliceName extends string, TParams extends any[]> {
  actionId: ActionId;

  constructor(private opts: ActionOpts<TSliceName, TParams>) {
    const hint = opts.userCallback.name;
    this.actionId = idGeneration.createActionId(opts.slice.sliceId, hint);

    if (actionRegistry.has(this.actionId)) {
      throw new Error(`ActionId "${this.actionId}" can not already exist`);
    }
    actionRegistry.set(this.actionId, this);
  }

  callable(): (...params: TParams) => Transaction<TSliceName, TParams> {
    return (...params) => {
      const sliceStateBuilder = this.opts.userCallback(...params);
      return sliceStateBuilder.makeTxn({
        params,
        actionId: this.actionId,
        sliceId: this.opts.slice.sliceId,
        sliceName: this.opts.slice.name,
      });
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

  makeTxn<TParams extends any[]>(obj: {
    actionId: ActionId;
    params: TParams;
    sliceId: SliceId;
    sliceName: TSliceName;
  }): Transaction<TSliceName, TParams> {
    return Transaction.create({
      name: this.opts.name,
      params: obj.params,
      actionId: obj.actionId,
      sourceSliceId: obj.sliceId,
      sourceSliceName: obj.sliceName,
    });
  }
}
