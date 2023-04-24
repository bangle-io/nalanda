import { createBaseSlice } from '../vanilla/create';
import { Effect, ExtractReturnTypes, PickOpts } from '../vanilla/types';
import type { StoreState } from '../vanilla/state';
import type { ReducedStore } from '../vanilla/store';
import {
  AnySlice,
  AnySliceWithName,
  Slice,
  UnknownSlice,
} from '../vanilla/slice';

export type ExtractSliceFromEffectSelectors<
  ES extends Record<
    string,
    [AnySlice, (storeState: StoreState<any>) => any, any]
  >,
> = ES extends Record<
  string,
  [infer S, (storeState: StoreState<any>) => any, any]
>
  ? S extends AnySliceWithName<infer N>
    ? N
    : never
  : never;

export const syncChangeEffect: typeof changeEffect = (
  name,
  effectSelectors,
  cb,
) => {
  return changeEffect(name, effectSelectors, cb, { sync: true });
};

export const changeEffect = <
  N extends string,
  ES extends Record<
    string,
    [AnySlice, (storeState: StoreState<any>) => any, PickOpts]
  >,
>(
  name: N,
  effectSelectors: ES,
  cb: (
    selectedVal: ExtractReturnTypes<{
      [K in keyof ES]: ES[K][1];
    }>,
    dispatch: ReducedStore<ExtractSliceFromEffectSelectors<ES>>['dispatch'],
    ref: Record<string, any>,
  ) => void | (() => void),
  opts?: { sync?: boolean },
): Slice<N, {}, ExtractSliceFromEffectSelectors<ES>, {}> => {
  const comparisonEntries = Object.entries(effectSelectors).map(
    (r): [string, (storeState: StoreState<any>) => any, PickOpts] => [
      r[0],
      r[1][1],
      r[1][2],
    ],
  );

  type RefValue = {
    current?: {
      firstRun: boolean;
      prevCleanup: void | (() => void);
      userRef: Record<string, any>;
    };
  };

  type SliceState = {
    ready: boolean;
  };

  type SliceEffect = Effect<N, SliceState, string, {}>;

  const deps = Array.from(
    new Set(Object.values(effectSelectors).map((r) => r[0])),
  ) as UnknownSlice[];

  const slice = createBaseSlice(deps, {
    name: name,
    initState: {
      ready: false,
    },
    derivedState: () => () => ({}),
    terminal: true,
  });

  const readyAction = Slice.createAction(slice, 'ready', () => {
    return (state) => ({
      ...state,
      ready: true,
    });
  });
  const effect: SliceEffect = {
    name: name + `(changeEffect)`,
    init(slice, store, ref: RefValue) {
      ref.current = {
        firstRun: true,
        prevCleanup: undefined,
        userRef: {},
      };
      store.dispatch(readyAction());
    },
    destroy(slice, state, ref: RefValue) {
      ref.current?.prevCleanup?.();
    },
  };

  const run: SliceEffect['update'] = (
    sl,
    store,
    prevStoreState,
    ref: RefValue,
  ) => {
    let hasNew = false;

    const newObjectEntries = comparisonEntries.map(([k, v, opts]) => {
      const newVal = v(store.state);
      const oldVal = v(prevStoreState);

      if (!opts.ignoreChanges && !Object.is(newVal, oldVal)) {
        hasNew = true;
      }

      return [k, newVal];
    });

    // ref should already be defined in the init
    const current = ref.current!;

    if (hasNew || current.firstRun) {
      if (current.firstRun) {
        current.firstRun = false;
      } else {
        current.prevCleanup?.();
      }

      const res = cb(
        Object.fromEntries(newObjectEntries),
        store.dispatch,
        current.userRef,
      );

      if (typeof res === 'function') {
        current.prevCleanup = res;
      }
    }
  };

  if (opts?.sync) {
    effect.updateSync = run;
  } else {
    effect.update = run;
  }

  Slice._registerEffect(slice, effect);

  return slice as any;
};
