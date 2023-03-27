import { createSlice } from '../vanilla';
import { ExtractReturnTypes, VoidFn } from '../vanilla/internal-types';
import {
  AnySlice,
  BareStore,
  Effect,
  TxCreator,
} from '../vanilla/public-types';
import { PickOpts, Slice } from '../vanilla/slice';
import type { StoreState } from '../vanilla/state';
import type { ReducedStore } from '../vanilla/store';

export type ExtractSliceFromEffectSelectors<
  ES extends Record<
    string,
    [AnySlice, (storeState: StoreState<any>) => any, any]
  >,
> = ES extends Record<
  string,
  [infer S, (storeState: StoreState<any>) => any, any]
>
  ? S
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
): Slice<N, {}, never, {}, VoidFn> => {
  const comparisonEntries = Object.entries(effectSelectors).map(
    (r): [string, (storeState: StoreState<any>) => any, PickOpts] => [
      r[0],
      r[1][1],
      r[1][2],
    ],
  );

  type EffectRef = {
    firstRun?: boolean;
    prevCleanup?: void | (() => void);
    userRef?: Record<string, any>;
  };

  const run = (
    sl: Slice<
      N,
      {
        ready: boolean;
      },
      any,
      {},
      VoidFn
    >,
    store: BareStore<any>,
    prevStoreState: BareStore<any>['state'],
    ref: EffectRef,
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

    if (hasNew || ref.firstRun) {
      if (ref.firstRun) {
        ref.firstRun = false;
      } else {
        ref.prevCleanup?.();
      }

      const res = cb(
        Object.fromEntries(newObjectEntries),
        store.dispatch,
        // ref should already be defined in the init
        ref.userRef!,
      );

      if (typeof res === 'function') {
        ref.prevCleanup = res;
      }
    }
  };

  const effect: Effect<
    N,
    {
      ready: boolean;
    },
    AnySlice,
    {
      ready: () => any;
    },
    VoidFn
  > = {
    name: name + `(changeEffect)`,
    init(slice, store, ref: EffectRef) {
      ref.firstRun = true;
      ref.prevCleanup = undefined;
      ref.userRef = {};
      store.dispatch(slice.actions.ready());
    },
    destroy(slice, state, ref: EffectRef) {
      ref?.prevCleanup?.();
    },
  };

  if (opts?.sync) {
    effect.updateSync = run;
  } else {
    effect.update = run;
  }

  let deps = Array.from(
    new Set(Object.values(effectSelectors).map((r) => r[0])),
  ) as any;

  const slice = createSlice(deps, {
    name: name,
    initState: {
      ready: false,
    },
    actions: {
      ready: () => () => ({
        ready: false,
      }),
    },
    selector: () => {},
    terminal: true,
  }).addEffect(effect);

  return slice as any;
};
