import { typed } from '../vanilla/common';
import { key, slice } from '../vanilla/create';
import type { Slice } from '../vanilla/slice';
import type { StoreState } from '../vanilla/state';
import type { ReducedStore } from '../vanilla/store';
import type { ExtractReturnTypes } from '../vanilla/types';

const keys: { [k: string]: number } = Object.create(null);

function createKey(name: string) {
  if (name in keys) {
    return name + '#' + ++keys[name];
  }
  keys[name] = 0;

  return name + '#';
}

type OpaqueSlice<K extends string, DS extends Slice[]> = Slice<
  K,
  {},
  DS,
  {},
  {}
>;

type ReducedStoreFromDS<DS extends Slice[]> = ReducedStore<DS[number]>;

export const onceEffect = <K extends string, DS extends Slice[]>(
  name: K,
  deps: DS,
  cb: (
    state: ReducedStoreFromDS<DS>['state'],
    dispatch: ReducedStoreFromDS<DS>['dispatch'],
  ) => void,
): OpaqueSlice<K, DS> => {
  const effect = slice({
    key: key(name, deps, {
      ready: false,
    }),
    actions: {
      ready: () => (state) => ({ ...state, ready: true }),
    },
    effects: {
      init(slice, store) {
        store.dispatch(slice.actions.ready());
      },
      update(sl, store, prevStoreState) {
        //  ts is unable to deal with DS as part of the type
        let _store: ReducedStore<typeof sl> = store;
        let _prevState: ReducedStore<typeof sl>['state'] = prevStoreState;

        if (sl.getState(_store.state).ready && !sl.getState(_prevState).ready) {
          cb(store.state, store.dispatch);
        }
      },
    },
  });

  return effect as unknown as OpaqueSlice<K, DS>;
};

export const syncOnceEffect = <K extends string, DS extends Slice[]>(
  name: K,
  deps: DS,
  cb: (
    state: ReducedStoreFromDS<DS>['state'],
    dispatch: ReducedStoreFromDS<DS>['dispatch'],
  ) => void,
): OpaqueSlice<K, DS> => {
  return slice({
    key: key(name, deps, {}),
    actions: {},
    effects: {
      init(slice, store) {
        cb(store.state, store.dispatch);
      },
    },
  });
};

export type ExtractSliceFromEffectSelectors<
  ES extends Record<string, [Slice, (storeState: StoreState) => any]>,
> = ES extends Record<string, [infer S, (storeState: StoreState) => any]>
  ? S
  : never;

const baseChangeEffect = <
  K extends string,
  ES extends Record<string, [Slice, (storeState: StoreState) => any]>,
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
    (r): [string, (storeState: StoreState) => any] => [r[0], r[1][1]],
  );

  type SliceState = {
    ref?: {
      firstRun: boolean;
      prevCleanup: void | (() => void);
    };
  };

  const run = (
    sl: Slice<K, SliceState>,
    store: ReducedStore<any>,
    prevStoreState: ReducedStore<any>['state'],
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

  const sliceKey = key(
    name,
    Object.values(effectSelectors).map((r) => r[0]) as any,
    typed<SliceState>({}),
  );

  let result = slice({
    key: sliceKey,
    actions: sliceKey.actions({
      ready: (initState: SliceState) => () => {
        return initState;
      },
    }),
    effects: {
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
      update: isSync ? undefined : run,
      updateSync: isSync ? run : undefined,
    },
  });

  return result;
};

export const changeEffect = <
  K extends string,
  ES extends Record<string, [Slice, (storeState: StoreState) => any]>,
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
  ES extends Record<string, [Slice, (storeState: StoreState) => any]>,
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
