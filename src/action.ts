import { SliceState, StoreState } from './store-state';
import { Slice } from './slice';
import { Step, Transaction } from './transaction';
import { ActionId, SliceId } from './helpers';
import { idGeneration } from './id_generation';

export type UserActionCallback<
  TParams extends any[],
  TActionBuilder extends ActionBuilder<any, any, any>,
> = (...params: TParams) => TActionBuilder;

export type ActionOpts<TSliceName extends string, TParams extends any[]> = {
  slice: Slice<TSliceName, any, any>;
  userCallback: UserActionCallback<TParams, ActionBuilder<any, any, any>>;
};

// we save actions in a global registry, so we can call them again
// with the params in the txn.
export const actionRegistry = new Map<ActionId, Action<any, any>>();

export class Action<TSliceName extends string, TParams extends any[]> {
  /**
   * @internal
   */
  static _applyStep(
    storeState: StoreState<any>,
    step: Step<any, any>,
  ): SliceState {
    const action = actionRegistry.get(step.actionId);

    if (!action) {
      throw new Error(
        `ActionId "${step.actionId}" for Slice "${step.sourceSliceId}" does not exist`,
      );
    }

    return action.applyStep(storeState, step);
  }

  actionId: ActionId;
  constructor(public readonly opts: ActionOpts<TSliceName, TParams>) {
    const hint = opts.userCallback.name;
    this.actionId = idGeneration.createActionId(opts.slice.sliceId, hint);

    if (actionRegistry.has(this.actionId)) {
      throw new Error(`ActionId "${this.actionId}" can not already exist`);
    }
    actionRegistry.set(this.actionId, this);
  }

  getTransactionBuilder(): (...params: TParams) => Transaction<TSliceName> {
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

  // applies the params to the action and returns the new slice state
  protected applyStep(
    storeState: StoreState<any>,
    step: Step<any, any>,
  ): SliceState {
    const existingState = storeState.getSliceState(step.targetSliceId);
    const actionBuilder = this.opts.userCallback(...step.params);
    const newUserSliceState = actionBuilder.opts.calcUserSliceState(storeState);

    if (existingState.userState === newUserSliceState) {
      return existingState;
    }

    return new SliceState(step.targetSliceId, newUserSliceState);
  }
}

// This is built new every time user calls mySliceAction({x:2})
//  and will also be built when a step is applied.
export class ActionBuilder<
  TSliceName extends string,
  TState extends object,
  TDep extends string,
> {
  constructor(
    public readonly opts: {
      name: TSliceName;
      calcUserSliceState: (storeState: StoreState<TSliceName | TDep>) => TState;
    },
  ) {}

  makeTxn<TParams extends any[]>(obj: {
    actionId: ActionId;
    params: TParams;
    sliceId: SliceId;
    sliceName: TSliceName;
  }): Transaction<TSliceName> {
    return Transaction.create({
      name: this.opts.name,
      params: obj.params,
      actionId: obj.actionId,
      sourceSliceId: obj.sliceId,
      sourceSliceName: obj.sliceName,
    });
  }
}
