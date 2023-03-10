import { coreReadySlice } from '../vanilla';
import { ExtractReturnTypes } from '../vanilla/internal-types';
import { AnySlice, BareStore, Effect } from '../vanilla/public-types';
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
) => {
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
    sl: Slice<N, unknown, any, any, any>,
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
      }
      ref.prevCleanup?.();

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

  const effect: Effect<Slice<N, {}, AnySlice, {}, {}>> = {
    init(slice, store, ref: EffectRef) {
      ref.firstRun = true;
      ref.prevCleanup = undefined;
      ref.userRef = {};
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

  // is needed to trigger the update on first run
  deps.push(coreReadySlice);

  return new Slice({
    name: name,
    dependencies: deps,
    initState: {},
    actions: {},
    selectors: {},
    effects: [effect],
  });
};
