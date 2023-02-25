import { coreReadySlice } from '../vanilla';
import { incrementalId } from '../vanilla/helpers';
import { ExtractReturnTypes } from '../vanilla/internal-types';
import { AnySlice, BareStore, Effect, typed } from '../vanilla/public-types';
import { Slice } from '../vanilla/slice';
import type { StoreState } from '../vanilla/state';
import type { ReducedStore } from '../vanilla/store';

type OpaqueSlice<K extends string, DS extends AnySlice> = Slice<
  K,
  {},
  DS,
  {},
  {}
>;

type ReducedStoreFromDS<DS extends AnySlice> = ReducedStore<DS>;

export function onceEffect<K extends string, DS extends AnySlice>(
  deps: DS[],
  name: K,
  cb: (
    state: ReducedStoreFromDS<DS>['state'],
    dispatch: ReducedStoreFromDS<DS>['dispatch'],
  ) => void,
): OpaqueSlice<K, DS>;
export function onceEffect<DS extends AnySlice>(
  deps: DS[],
  cb: (
    state: ReducedStoreFromDS<DS>['state'],
    dispatch: ReducedStoreFromDS<DS>['dispatch'],
  ) => void,
): OpaqueSlice<string, DS>;
export function onceEffect<K extends string, DS extends AnySlice>(
  deps: DS[],
  ...args: any[]
): OpaqueSlice<K, DS> {
  const name =
    args.length === 1 ? 'onceEffect(' + incrementalId() + ')' : args[0];
  const cb = args.length === 1 ? args[0] : args[1];

  const effect = new Slice({
    name: name,
    selectors: {},
    dependencies: [
      ...deps,
      // need this dependency to ensure update is run
      coreReadySlice,
    ],
    initState: {},
    actions: {},
    effects: [
      {
        name: name,
        update(
          sl,
          store: BareStore<any>,
          prevStoreState: BareStore<any>['state'],
          ref: { done?: boolean },
        ) {
          if (!ref.done && coreReadySlice.getState(store.state).ready) {
            cb(store.state, store.dispatch);
            ref.done = true;
          }
        },
      },
    ],
  });

  return effect as unknown as OpaqueSlice<K, DS>;
}

export function syncOnceEffect<K extends string, DS extends AnySlice>(
  deps: DS[],
  name: K,
  cb: (
    state: BareStore<DS>['state'],
    dispatch: BareStore<DS>['dispatch'],
  ) => void,
): OpaqueSlice<K, never>;
export function syncOnceEffect<DS extends AnySlice>(
  deps: DS[],
  cb: (
    state: BareStore<DS>['state'],
    dispatch: BareStore<DS>['dispatch'],
  ) => void,
): OpaqueSlice<string, DS>;
export function syncOnceEffect<DS extends AnySlice>(
  deps: DS[],
  ...args: any[]
): OpaqueSlice<any, DS> {
  const name =
    args.length === 1 ? 'syncOnceEffect(' + incrementalId() + ')' : args[0];
  const cb = args.length === 1 ? args[0] : args[1];

  return new Slice({
    name: name,
    dependencies: deps,
    actions: {},
    selectors: {},
    initState: {},
    effects: [
      {
        init(slice, store) {
          cb(store.state, store.dispatch as any);
        },
      },
    ],
  });
}

export type ExtractSliceFromEffectSelectors<
  ES extends Record<string, [AnySlice, (storeState: StoreState<any>) => any]>,
> = ES extends Record<string, [infer S, (storeState: StoreState<any>) => any]>
  ? S
  : never;

export const changeEffect = <
  N extends string,
  ES extends Record<string, [AnySlice, (storeState: StoreState<any>) => any]>,
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
    (r): [string, (storeState: StoreState<any>) => any] => [r[0], r[1][1]],
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

    const newObjectEntries = comparisonEntries.map(([k, v]) => {
      const newVal = v(store.state);
      const oldVal = v(prevStoreState);

      if (!Object.is(newVal, oldVal)) {
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
