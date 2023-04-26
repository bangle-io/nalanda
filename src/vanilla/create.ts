import { createLineageId } from './helpers';
import {
  AnySlice,
  Slice,
  SliceConfig,
  SliceReducer,
  UnknownSlice,
} from './slice';
import { StoreState } from './state';
import {
  DerivedStateFn,
  ExtractReturnTypes,
  NoInfer,
  ActionBuilder,
  TransactionBuilder,
} from './types';

type DepSliceToStr<TDepSlice extends Slice<string, any, any, any>> =
  TDepSlice extends Slice<infer TN, any, any, any> ? TN : never;

type ActionBuilderRecordConvert<
  N extends string,
  A extends Record<string, any>,
> = {
  [KK in keyof A]: A[KK] extends ActionBuilder<infer P, any, any>
    ? TransactionBuilder<N, P>
    : never;
};

export function createSelector<
  N extends string,
  TState,
  TDependency extends string,
  TSelector,
  R extends Record<
    string,
    (sliceState: TState, storeState: StoreState<TDependency>) => any
  >,
>(
  fieldSelectors: R,
  select: (
    funcs: {
      [K in keyof R]: R[K] extends (...args: any[]) => infer R ? R : never;
    },
    storeState: StoreState<TDependency>,
  ) => TSelector,
  // TODO maybe we donot need to send the store in the final callback of each select
): DerivedStateFn<N, TState, TDependency, TSelector> {
  const returnVal: DerivedStateFn<string, TState, string, TSelector> = (
    initStoreState,
    slice,
  ) => {
    const entries: [
      string,
      (sliceState: TState, storeState: StoreState<string>) => any,
    ][] = Object.entries(fieldSelectors);

    let resolveSelected = entries.map(([k, v]): [string, unknown] => [
      k,
      v(slice.getState(initStoreState), initStoreState),
    ]);
    let prevResult: TSelector = select(
      Object.fromEntries(resolveSelected) as any,
      initStoreState,
    );

    return (storeState: StoreState<string>) => {
      const values = entries.map(([k, v]): [string, unknown] => [
        k,
        v(slice.getState(storeState), storeState),
      ]);

      if (values.some((v, i) => v[1] !== resolveSelected[i]![1])) {
        resolveSelected = values;
        prevResult = select(Object.fromEntries(values) as any, storeState);
      }

      return prevResult;
    };
  };

  return returnVal;
}

export function createSliceV2<
  N extends string,
  TState,
  TDepSlice extends Slice<string, any, any, any>,
>(
  dependencies: TDepSlice[],
  arg: {
    name: N;
    initState: TState;
  },
) {
  return createBaseSlice(dependencies, {
    ...arg,
    derivedState: () => () => ({}),
  });
}

export function createSliceWithSelectors<
  N extends string,
  TState,
  TDepSlice extends Slice<string, any, any, any>,
  TSelector extends Record<
    string,
    DerivedStateFn<
      NoInfer<N>,
      NoInfer<TState>,
      NoInfer<DepSliceToStr<TDepSlice>>,
      any
    >
  >,
>(
  dependencies: TDepSlice[],
  arg: {
    name: N;
    initState: TState;
    selectors: TSelector;
    terminal?: boolean;
  },
): Slice<
  N,
  TState,
  DepSliceToStr<TDepSlice>,
  ExtractReturnTypes<{
    [K in keyof TSelector]: ReturnType<TSelector[K]>;
  }>
> {
  return createBaseSlice(dependencies, {
    ...arg,
    derivedState: (initStoreState, sl) => {
      const selectors: Array<[string, (s: StoreState<any>) => unknown]> =
        Object.entries(arg.selectors).map(([k, v]) => [
          k,
          v(initStoreState, sl),
        ]);

      let prevChangeRef = StoreState.getChangeRef(initStoreState, sl);

      let prevDerivedState = Object.fromEntries(
        selectors.map(([k, v]) => [k, v(initStoreState)]),
      );

      return (storeState) => {
        const changeRef = StoreState.getChangeRef(storeState, sl);

        if (changeRef === prevChangeRef) {
          return prevDerivedState;
        }

        prevChangeRef = changeRef;

        prevDerivedState = Object.fromEntries(
          selectors.map(([k, v]) => [k, v(storeState)]),
        );

        return prevDerivedState;
      };
    },
  }) as any;
}

export function createSlice<
  N extends string,
  TState,
  TDepSlice extends Slice<string, any, any, any>,
  A extends Record<
    string,
    ActionBuilder<any[], TState, DepSliceToStr<TDepSlice>>
  >,
>(
  dependencies: TDepSlice[],
  arg: {
    name: N;
    initState: TState;
    actions: A;
    terminal?: boolean;
    freeze?: boolean;
  },
): Slice<N, TState, DepSliceToStr<TDepSlice>, {}> & {
  actions: ActionBuilderRecordConvert<N, A>;
} {
  const slice = createBaseSlice(dependencies, {
    ...arg,
    derivedState: () => () => ({}),
  });

  let actions: Record<string, TransactionBuilder<N, any>> = {};

  for (const [actionName, action] of Object.entries(arg.actions)) {
    actions[actionName] = Slice.createAction(slice, actionName, action);
  }

  // TODO remove this stopgap when we have a better way to move to
  // defining actions separately from slice
  if ((slice as any).actions) {
    throw new Error('actions already exists');
  }

  Object.assign(slice, { actions: actions });

  if (arg.freeze === true || arg.freeze === undefined) {
    return slice.finalize() as any;
  }
  return slice as any;
}

export function createBaseSlice<
  N extends string,
  TState,
  TDepSlice extends Slice<string, any, any, any>,
  TDerivedState,
>(
  dependencies: TDepSlice[],
  arg: {
    name: N;
    initState: TState;
    derivedState: DerivedStateFn<
      NoInfer<N>,
      NoInfer<TState>,
      NoInfer<DepSliceToStr<TDepSlice>>,
      TDerivedState
    >;
    reducer?: SliceReducer<
      NoInfer<N>,
      NoInfer<TState>,
      DepSliceToStr<NoInfer<TDepSlice>>,
      NoInfer<TDerivedState>
    >;
    terminal?: boolean;
  },
  config: Partial<SliceConfig> = {},
): Slice<N, TState, DepSliceToStr<TDepSlice>, TDerivedState> {
  const defaultReducer: SliceReducer<
    N,
    TState,
    DepSliceToStr<TDepSlice>,
    TDerivedState
  > = (sliceState, tx, action, storeState) => {
    return action(...tx.payload)(sliceState, storeState);
  };

  const slice: Slice<
    N,
    TState,
    DepSliceToStr<TDepSlice>,
    TDerivedState
  > = new Slice(
    {
      dependencies,
      derivedState: arg.derivedState,
      initState: arg.initState,
      name: arg.name,
      reducer: arg.reducer || defaultReducer,
      terminal: arg.terminal || false,
      lineageId: createLineageId(arg.name),
      actionBuilders: Object.create(null),
      effects: [],
    },
    config,
  );

  return slice;
}
