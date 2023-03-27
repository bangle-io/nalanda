import { mapObjectValues } from './helpers';
import {
  createSliceKey,
  createSliceNameOpaque,
  LineageId,
  VoidFn,
} from './internal-types';
import {
  ActionBuilder,
  AnySlice,
  Effect,
  SelectorFn,
  TxCreator,
} from './public-types';
import { Slice } from './slice';
import { Transaction } from './transaction';

class SliceKey<
  N extends string,
  SS extends object,
  SE extends SelectorFn<SS, DS, any>,
  DS extends AnySlice,
> {
  constructor(
    public name: N,
    public dependencies: DS[],
    public initState: SS,
    public selector: SE,
  ) {}
}

export function createKey<
  K extends string,
  SS extends object,
  DS extends AnySlice,
>(id: K, deps: DS[], initState: SS): SliceKey<K, SS, VoidFn, DS>;
export function createKey<
  K extends string,
  SS extends object,
  DS extends AnySlice,
  SE extends SelectorFn<SS, DS, any>,
>(id: K, deps: DS[], initState: SS, selector: SE): SliceKey<K, SS, SE, DS>;
export function createKey(
  id: any,
  deps: any[],
  initState: any,
  selector?: any,
): any {
  return new SliceKey(id, deps, initState, selector || (() => {}));
}

type InferName<SK extends SliceKey<any, any, any, any>> = SK extends SliceKey<
  infer N,
  any,
  any,
  any
>
  ? N
  : never;
type InferInitState<SK extends SliceKey<any, any, any, any>> =
  SK extends SliceKey<any, infer SS, any, any> ? SS : never;
type InferDependencies<SK extends SliceKey<any, any, any, any>> =
  SK extends SliceKey<any, any, any, infer DS> ? DS : never;
type InferSelector<SK extends SliceKey<any, any, any, any>> =
  SK extends SliceKey<any, any, infer SE, any> ? SE : never;

export function slice<
  SK extends SliceKey<any, any, any, any>,
  A extends Record<
    string,
    ActionBuilder<any[], InferInitState<SK>, InferDependencies<SK>>
  >,
>({
  key,
  actions,
  effects,
}: {
  key: SK;
  actions: A;
  effects?: Effect<
    SK['name'],
    InferInitState<SK>,
    InferDependencies<SK>,
    any,
    InferSelector<SK>
  >[];
}): Slice<
  InferName<SK>,
  InferInitState<SK>,
  InferDependencies<SK>,
  ActionBuilderRecordConvert<InferName<SK>, A>,
  InferSelector<SK>
> {
  let sel: typeof key.selector = key.selector || (() => {});
  const slice = new Slice({
    actions: ({ lineageId }) =>
      expandActionBuilders(key.name, actions, lineageId),
    reducer: (sliceState, storeState, tx) => {
      const apply = actions[tx.actionId];

      if (!apply) {
        throw new Error(
          `Action "${tx.actionId}" not found in Slice "${key.name}"`,
        );
      }
      return apply(...tx.payload)(sliceState, storeState);
    },
    dependencies: key.dependencies,
    effects: effects || [],
    initState: key.initState,
    name: key.name,
    selector: sel,
  });

  return slice;
}

type ActionBuilderRecordConvert<
  K extends string,
  A extends Record<string, any>,
> = {
  [KK in keyof A]: A[KK] extends ActionBuilder<infer P, any, any>
    ? TxCreator<K, P>
    : never;
};

export function createSlice<
  N extends string,
  SS extends object,
  DS extends Slice<string, any, any, {}, VoidFn>,
  A extends Record<string, ActionBuilder<any[], SS, DS>>,
  SE extends SelectorFn<SS, DS, any>,
>(
  dependencies: DS[],
  arg: {
    name: N;
    initState: SS;
    actions: A;
    selector: SE;
    terminal?: boolean;
  },
): Slice<N, SS, DS, ActionBuilderRecordConvert<N, A>, SE> {
  const slice = new Slice({
    actions: ({ lineageId }) =>
      expandActionBuilders(arg.name, arg.actions, lineageId),
    dependencies,
    effects: [],
    initState: arg.initState,
    name: arg.name,
    selector: arg.selector || (() => {}),
    reducer: (sliceState, storeState, tx) => {
      const apply = arg.actions[tx.actionId];

      if (!apply) {
        throw new Error(
          `Action "${tx.actionId}" not found in Slice "${arg.name}"`,
        );
      }

      return apply(...tx.payload)(sliceState, storeState);
    },
    terminal: arg.terminal || false,
  });

  return slice;
}

function expandActionBuilders<
  N extends string,
  A extends Record<string, ActionBuilder<any[], any, any>>,
>(name: N, actions: A, lineageId: LineageId): ActionBuilderRecordConvert<N, A> {
  let sliceName = createSliceNameOpaque(name);
  const result: Record<string, TxCreator> = mapObjectValues(
    actions,
    (action, actionId): TxCreator => {
      return (...params) => {
        return new Transaction({
          sourceSliceName: sliceName,
          targetSliceLineage: lineageId,
          payload: params,
          actionId,
        });
      };
    },
  );

  return result as any;
}
