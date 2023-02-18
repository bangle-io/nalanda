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
    key: name,
    selectors: {},
    dependencies: deps,
    initState: typed<{ ready?: boolean }>({}),
    actions: {
      ready: () => (state) => ({ ...state, ready: true }),
    },
    effects: [
      {
        name: name,
        init(slice, store) {
          store.dispatch(slice.actions.ready());
        },
        update(
          sl,
          store: BareStore<any>,
          prevStoreState: BareStore<any>['state'],
        ) {
          if (
            sl.getState(store.state).ready &&
            !sl.getState(prevStoreState).ready
          ) {
            cb(store.state, store.dispatch);
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
    key: name,
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

const baseChangeEffect = <
  K extends string,
  ES extends Record<string, [AnySlice, (storeState: StoreState<any>) => any]>,
>(
  name: K,
  effectSelectors: ES,
  cb: (
    selectedVal: ExtractReturnTypes<{
      [K in keyof ES]: ES[K][1];
    }>,
    dispatch: ReducedStore<ExtractSliceFromEffectSelectors<ES>>['dispatch'],
  ) => void | (() => void),
  isSync = false,
) => {
  const comparisonEntries = Object.entries(effectSelectors).map(
    (r): [string, (storeState: StoreState<any>) => any] => [r[0], r[1][1]],
  );

  type SliceState = {
    ref?: {
      firstRun: boolean;
      prevCleanup: void | (() => void);
    };
  };

  const run = (
    sl: Slice<K, SliceState, any, any, any>,
    store: BareStore<any>,
    prevStoreState: BareStore<any>['state'],
  ) => {
    const sliceStateRef = sl.getState(store.state).ref;
    // sliceStateRef should always be defined, since `init` is called before `update`
    if (!sliceStateRef) {
      throw new Error('sliceStateRef cannot be undefined');
    }

    let hasNew = false;

    const newObjectEntries = comparisonEntries.map(([k, v]) => {
      const newVal = v(store.state);
      const oldVal = v(prevStoreState);

      if (!Object.is(newVal, oldVal)) {
        hasNew = true;
      }

      return [k, newVal];
    });

    if (hasNew || sliceStateRef.firstRun) {
      if (sliceStateRef.firstRun) {
        sliceStateRef.firstRun = false;
      }
      sliceStateRef.prevCleanup?.();

      const res = cb(Object.fromEntries(newObjectEntries), store.dispatch);

      if (typeof res === 'function') {
        sliceStateRef.prevCleanup = res;
      }
    }
  };

  const effect: Effect<
    Slice<
      K,
      SliceState,
      any,
      {
        ready: (state: SliceState) => (s: any) => any;
      },
      any
    >
  > = {
    init(slice, store) {
      // we need to save a unique reference per initialization in the state
      // since we are going to mutate it in place. If we don't do this, it
      // will cause issues if multiple store use the same instance of slice.
      // this has another benefit of calling update on the first run.
      store.dispatch(
        slice.actions.ready({
          ref: {
            firstRun: true,
            prevCleanup: undefined,
          },
        }),
      );
    },
    destroy(slice, state) {
      slice.getState(state).ref?.prevCleanup?.();
    },
  };

  if (isSync) {
    effect.updateSync = run;
  } else {
    effect.update = run;
  }

  return new Slice({
    key: name,
    dependencies: Array.from(
      new Set(Object.values(effectSelectors).map((r) => r[0])),
    ) as any,
    initState: typed<SliceState>({}),
    actions: {
      ready: (initState: SliceState) => () => {
        return initState;
      },
    },
    selectors: {},
    effects: [effect],
  });
};

export const changeEffect = <
  K extends string,
  ES extends Record<string, [AnySlice, (storeState: StoreState<any>) => any]>,
>(
  name: K,
  effectSelectors: ES,
  cb: (
    selectedVal: ExtractReturnTypes<{
      [K in keyof ES]: ES[K][1];
    }>,
    dispatch: ReducedStore<ExtractSliceFromEffectSelectors<ES>>['dispatch'],
  ) => void | (() => void),
) => {
  return baseChangeEffect(name, effectSelectors, cb, false);
};

export const changeEffectSync = <
  K extends string,
  ES extends Record<string, [AnySlice, (storeState: StoreState<any>) => any]>,
>(
  name: K,
  effectSelectors: ES,
  cb: (
    selectedVal: ExtractReturnTypes<{
      [K in keyof ES]: ES[K][1];
    }>,
    dispatch: ReducedStore<ExtractSliceFromEffectSelectors<ES>>['dispatch'],
  ) => void | (() => void),
) => {
  return baseChangeEffect(name, effectSelectors, cb, true);
};
