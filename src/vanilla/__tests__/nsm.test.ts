import { waitUntil } from '../../test-helpers/test-helpers';
import {
  createBaseSlice,
  createSlice,
  createSliceWithSelectors,
} from '../create';
import { timeoutSchedular } from '../effect';
import { AnySliceWithName, Slice } from '../slice';
import { StoreState } from '../state';
import { Store } from '../store';
import { expectType } from '../types';

function sleep(t = 20): Promise<void> {
  return new Promise((res) => setTimeout(res, t));
}

const testSlice1 = createSlice([], {
  name: 'test-1',
  initState: {
    num: 4,
  },
  actions: {
    increment: (opts: { increment: boolean }) => (state) => {
      return { ...state, num: state.num + (opts.increment ? 1 : 0) };
    },
    decrement: (opts: { decrement: boolean }) => (state) => {
      return { ...state, num: state.num - (opts.decrement ? 1 : 0) };
    },
  },
});

const testSlice2 = createSlice([], {
  name: 'test-2',
  initState: {
    name: 'tame',
  },
  actions: {
    prefix: (prefix: string) => (state) => {
      return { ...state, name: prefix + state.name };
    },
    padEnd: (length: number, pad: string) => (state) => {
      return { ...state, name: state.name.padEnd(length, pad) };
    },
    uppercase: () => (state) => {
      return { ...state, name: state.name.toUpperCase() };
    },
  },
});

const testSlice3 = createSlice([], {
  name: 'test-3',
  initState: {
    name: 'tame',
  },
  actions: {
    lowercase: () => (state) => {
      return { ...state, name: state.name.toLocaleLowerCase() };
    },
  },
});

test('type check', () => {
  // const state = {} as StoreState<'bangle/page-slice' | 'editor-manager-slice'>;
  const store = Store.create({
    storeName: 'test-store',
    scheduler: timeoutSchedular(0),
    state: [testSlice1, testSlice2],
  });

  testSlice1.getState(store.state);
});

test('empty store', () => {
  const store = Store.create({
    storeName: 'test-store',
    scheduler: timeoutSchedular(0),
    state: [testSlice1],
  });

  store.dispatch(testSlice1.actions.increment({ increment: true }));
  store.dispatch(testSlice1.actions.increment({ increment: true }));
  store.dispatch(testSlice1.actions.increment({ increment: true }));

  StoreState.getSliceState(store.state, testSlice1);

  testSlice1.getState(store.state);

  expect(testSlice1.getState(store.state)).toEqual({
    num: 7,
  });
  store.dispatch(testSlice1.actions.decrement({ decrement: true }));

  expect(testSlice1.getState(store.state)).toEqual({
    num: 6,
  });
});

test('dispatching slices that are not registered', () => {
  const store = Store.create({
    scheduler: timeoutSchedular(0),
    storeName: 'test-store',
    // ignore transactions for testing errorful dispatches
    dispatchTx(store, tx) {},
    state: [testSlice1],
  });

  store.dispatch(testSlice1.actions.decrement({ decrement: true }));

  expect(() =>
    // @ts-expect-error testSlice2 is not in the store, so this should always fail
    store.dispatch(testSlice2.actions.uppercase()),
  ).toThrowErrorMatchingInlineSnapshot(
    `"Cannot dispatch transaction as slice "l_test-2$" is not registered in Store"`,
  );
});

test('custom dispatch', () => {
  let count = 0;
  const store = Store.create({
    scheduler: timeoutSchedular(0),
    storeName: 'test-store',
    state: [testSlice1, testSlice2],

    dispatchTx(store, tx) {
      expectType<'test-1' | 'test-2'>(tx.config.sourceSliceName);

      let oldState = store.state;
      let newState = store.state.applyTransaction(tx);

      if (newState === oldState) {
        count++;

        return;
      }

      Store.updateState(store, newState, tx);
    },
  });

  store.dispatch(testSlice1.actions.decrement({ decrement: true }));

  // @ts-expect-error testSlice3 is not in the store, so this should always fail
  () => store.dispatch(testSlice3.actions.lowercase());
});

describe('sync effects', () => {
  test('sync update call ordering should be correct', async () => {
    let callOrder: string[] = [];
    const e1 = createSlice([], {
      name: 'e1',
      initState: {
        num: 4,
      },
      actions: {
        increment: () => (state) => {
          return { ...state, num: state.num + 2 };
        },
      },
      freeze: false,
    });

    Slice._registerEffect(e1, {
      updateSync(sl, store, prevState) {
        callOrder.push('s1');
        sl.getState(store.state);
      },
    });

    const e2 = createSlice([e1], {
      name: 'e2',
      initState: {
        num: 4,
      },
      actions: {
        increment: () => (state) => {
          return { ...state, num: state.num + 1 };
        },
      },
      freeze: false,
    });

    Slice._registerEffect(e2, {
      updateSync(sl, store, prevState) {
        callOrder.push('s2');

        sl.getState(store.state);
      },
    });

    const store = Store.create({
      scheduler: timeoutSchedular(0),
      storeName: 'test-store',
      state: [e1, e2],

      dispatchTx(store, tx) {
        let newState = store.state.applyTransaction(tx);

        if (newState === store.state) {
          console.debug(
            'No state change, skipping update',
            tx.sourceSliceLineage,
          );

          return;
        }

        Store.updateState(store, newState, tx);

        callOrder.push(`afterUpdate[${tx.sourceSliceLineage}]`);
      },
    });
    store.dispatch(e1.actions.increment());

    expect(callOrder).toEqual(['afterUpdate[l_e1$]']);

    store.dispatch(e1.actions.increment());

    expect(callOrder).toEqual(['afterUpdate[l_e1$]', 'afterUpdate[l_e1$]']);

    // effects should run after microtasks
    await Promise.resolve();
    expect(callOrder).toEqual([
      'afterUpdate[l_e1$]',
      'afterUpdate[l_e1$]',
      's1',
      's2',
    ]);

    store.dispatch(e2.actions.increment());

    expect(callOrder).toEqual([
      'afterUpdate[l_e1$]',
      'afterUpdate[l_e1$]',
      's1',
      's2',
      'afterUpdate[l_e2$]',
    ]);

    await Promise.resolve();
    // should run only e2 effects
    expect(callOrder).toEqual([
      'afterUpdate[l_e1$]',
      'afterUpdate[l_e1$]',
      's1',
      's2',
      'afterUpdate[l_e2$]',
      's2',
    ]);
  });

  test('effect gets prev state', async () => {
    const called: Array<{ prev: number; cur: number }> = [];
    const e1 = createSlice([], {
      name: 'e1',
      initState: {
        num: 4,
      },
      actions: {
        increment: () => (state) => {
          return { ...state, num: state.num + 2 };
        },
      },
      freeze: false,
    });

    Slice._registerEffect(e1, {
      updateSync(sl, store, prevState) {
        called.push({
          cur: sl.getState(store.state).num,
          prev: sl.getState(prevState).num,
        });
      },
    });

    const store = Store.create({
      scheduler: timeoutSchedular(0),
      storeName: 'test-store',
      state: [e1],
    });

    store.dispatch(e1.actions.increment());

    // effects should run after microtasks
    await Promise.resolve();

    expect(called).toEqual([{ cur: 6, prev: 4 }]);

    store.dispatch(e1.actions.increment());
    await Promise.resolve();

    expect(called[1]).toEqual({ cur: 8, prev: 6 });

    // dispatching multiple times should only trigger effect once
    // with correct prev state
    store.dispatch(e1.actions.increment());
    store.dispatch(e1.actions.increment());

    await Promise.resolve();
    expect(called[2]).toEqual({
      cur: 12, // cur went +4 ahead
      prev: 8, // prev state is what the effect saw last time
    });
    expect(called[3]).toBeUndefined(); // should only run it once for multiple dispatches
  });

  test('effect with dep gets prev state', async () => {
    const called1: Array<{ prev: number; cur: number }> = [];
    const called2: Array<{
      e1: { prev: number; cur: number };
      e2: { prev: number; cur: number };
    }> = [];
    const e1 = createSlice([], {
      name: 'e1',
      initState: {
        num: 4,
      },
      actions: {
        increment: () => (state) => {
          return { ...state, num: state.num + 2 };
        },
      },
      freeze: false,
    });

    Slice._registerEffect(e1, {
      updateSync(sl, store, prevState) {
        called1.push({
          cur: sl.getState(store.state).num,
          prev: sl.getState(prevState).num,
        });
      },
    });

    const e2 = createSlice([e1], {
      name: 'e2',
      initState: {
        num: 4,
      },
      actions: {
        increment: () => (state) => {
          return { ...state, num: state.num + 5 };
        },
      },
      freeze: false,
    });

    Slice._registerEffect(e2, {
      updateSync(sl, store, prevState) {
        called2.push({
          e1: {
            cur: e1.getState(store.state).num,
            prev: e1.getState(prevState).num,
          },
          e2: {
            cur: sl.getState(store.state).num,
            prev: sl.getState(prevState).num,
          },
        });
      },
    });

    const store = Store.create({
      scheduler: timeoutSchedular(0),
      storeName: 'test-store',
      state: [e1, e2],
    });

    store.dispatch(e1.actions.increment());

    // effects should run after microtasks
    await Promise.resolve();
    expect(called1[0]).toEqual({ cur: 6, prev: 4 });
    expect(called2[0]).toEqual({
      e2: {
        cur: 4,
        prev: 4,
      },
      e1: { cur: 6, prev: 4 },
    });

    store.dispatch(e2.actions.increment());
    await Promise.resolve();

    expect(called1[1]).toBeUndefined();
    expect(called2[1]).toEqual({
      e2: {
        cur: 9,
        prev: 4,
      },
      e1: { cur: 6, prev: 6 },
    });
  });

  test('one effect triggering other effects', async () => {
    const e1 = createSlice([], {
      name: 'e1',
      initState: {
        num: 1,
        two: 0,
      },
      actions: {
        increment: () => (state) => {
          return { ...state, num: state.num + 1 };
        },
        sawTwo: () => (state) => {
          return { ...state, two: state.two + 1 };
        },
      },
      freeze: false,
    });

    Slice._registerEffect(e1, {
      updateSync(sl, store, prevState) {
        const cur = sl.getState(store.state).num;
        const prev = sl.getState(prevState).num;

        if (cur !== prev) {
          if (cur % 2 === 0) {
            store.dispatch(e1.actions.sawTwo());
          }
        }
      },
    });

    const e2 = createSlice([e1], {
      name: 'e2',
      initState: {
        info: [] as string[],
      },
      actions: {
        save: (info: string) => (state) => {
          return { ...state, info: [...state.info, info] };
        },
      },
    });

    const e3 = createSlice([e1, e2], {
      name: 'e3',
      initState: {},
      actions: {},
      freeze: false,
    });

    Slice._registerEffect(e3, {
      updateSync(sl, store, prevState) {
        store.dispatch(e2.actions.save('two'));
      },
    });

    const store = Store.create({
      scheduler: timeoutSchedular(0),
      storeName: 'test-store',
      state: [e1, e2],
    });

    store.dispatch(e1.actions.increment());

    // effects should run after microtasks
    store.dispatch(e1.actions.increment());
    await Promise.resolve();
    expect(e1.getState(store.state)).toMatchInlineSnapshot(`
      {
        "num": 3,
        "two": 0,
      }
    `);
    expect(e2.getState(store.state)).toMatchInlineSnapshot(`
      {
        "info": [],
      }
    `);

    store.dispatch(e1.actions.increment());
    store.dispatch(e1.actions.increment());
    store.dispatch(e1.actions.increment());
    await Promise.resolve();

    expect(e1.getState(store.state)).toMatchInlineSnapshot(`
      {
        "num": 6,
        "two": 1,
      }
    `);
  });

  test('order of effect run is first in first out', async () => {
    const ef1 = jest.fn();
    const ef2 = jest.fn();
    const ef3 = jest.fn();
    let callOrder: any[] = [];
    const e1 = createSlice([], {
      name: 'e1',
      initState: { num: 0 },
      actions: {
        increment: () => (state) => {
          return { ...state, num: state.num + 2 };
        },
      },
      freeze: false,
    });

    Slice._registerEffect(e1, {
      updateSync(sl, store, prevState) {
        ef1();
        callOrder.push([
          'e1',
          sl.getState(store.state).num,
          sl.getState(prevState).num,
        ]);

        if (sl.getState(store.state).num < 16) {
          store.dispatch(e1.actions.increment());
        }
      },
    });

    let e2PrevSeen: any = undefined;

    const e2 = createSlice([e1], {
      name: 'e2',
      initState: {},
      actions: {},
      freeze: false,
    });

    Slice._registerEffect(e2, {
      updateSync(sl, store, prevState) {
        if (e2PrevSeen === undefined) {
          e2PrevSeen = store.state;
        } else {
          // if (e2PrevSeen !== prevState) {
          //   throw new Error('e2 should have seen the same prev state');
          // }
          e2PrevSeen = store.state;
        }
        ef2();
        callOrder.push([
          'e2',
          e1.getState(store.state).num,
          e1.getState(prevState).num,
        ]);
      },
    });

    const e3 = createSlice([e2], {
      name: 'e3',
      initState: {},
      actions: {},
      freeze: false,
    });

    Slice._registerEffect(e3, {
      updateSync(sl, store, prevState) {
        ef3();
        callOrder.push(['e3']);
      },
    });

    const store = Store.create({
      scheduler: timeoutSchedular(0),
      storeName: 'test-store',
      state: [e1, e2, e3],
    });

    store.dispatch(e1.actions.increment());

    await Promise.resolve();
    expect(ef1).toBeCalledTimes(8); // 8*2 = 16
    expect(ef2).toBeCalledTimes(4);
    expect(ef3).toBeCalledTimes(4);

    expect(callOrder.map((r) => [r[0] + ':' + r.slice(1).join(',')])).toEqual([
      ['e1:2,0'],
      ['e2:4,0'],
      ['e3:'],
      ['e1:4,2'],
      ['e1:6,4'],
      ['e2:8,4'],
      ['e3:'],
      ['e1:8,6'],
      ['e1:10,8'],
      ['e2:12,8'],
      ['e3:'],
      ['e1:12,10'],
      ['e1:14,12'],
      ['e2:16,12'],
      ['e3:'],
      ['e1:16,14'],
    ]);
  });
});

describe('effects', () => {
  test('after destroy effects are not run', async () => {
    const callCheck = jest.fn();
    const e1 = createBaseSlice([], {
      name: 'e1',
      initState: { num: 0 },
      derivedState: () => () => ({}),
    });

    const incrementAction = Slice.createAction(
      e1,
      'increment',
      () => (state) => {
        return { ...state, num: state.num + 2 };
      },
    );

    Slice._registerEffect(e1, {
      update(sl, store, prevState) {
        incrementAction();
        callCheck();
      },
    });

    const store = Store.create({
      scheduler: timeoutSchedular(1),
      storeName: 'test-store',
      state: [e1],
    });

    store.dispatch(incrementAction());

    await waitUntil(store, (state) => e1.getState(state).num > 0);

    expect(callCheck).toBeCalledTimes(1);

    const lastState = store.state;
    store.destroy();
    store.dispatch(incrementAction());

    await sleep(5);
    expect(callCheck).toBeCalledTimes(1);
    expect(store.state).toBe(lastState);
    expect(e1.getState(lastState).num).toBe(2);
  });

  test('works', async () => {
    let callOrder: string[] = [];

    const e1 = createBaseSlice([], {
      name: 'e1',
      initState: {
        num: 0,
      },
      derivedState: () => () => ({}),
    });

    Slice._registerEffect(e1, {
      update(sl, store, prevState) {
        callOrder.push(
          's1= ' +
            [sl.getState(store.state).num, sl.getState(prevState).num].join(
              ',',
            ),
        );
        sl.getState(store.state);
        store.dispatch(incrementActionE1());
      },
    });

    const incrementActionE1 = Slice.createAction(
      e1,
      'increment',
      () => (state) => {
        return { ...state, num: state.num + 2 };
      },
    );

    const e2 = createBaseSlice([e1], {
      name: 'e2',
      initState: {
        num: 0,
      },
      derivedState: () => () => ({}),
    });

    const incrementActionE2 = Slice.createAction(e2, 'increment', () => {
      return (state) => {
        return { ...state, num: state.num + 2 };
      };
    });

    Slice._registerEffect(e1, {
      update(sl, store, prevState) {
        callOrder.push(
          's2= ' +
            [e1.getState(store.state).num, e1.getState(prevState).num].join(
              ',',
            ),
        );
      },
    });

    const store = Store.create({
      scheduler: timeoutSchedular(1),
      storeName: 'test-store',
      state: [e1, e2],

      dispatchTx(store, tx) {
        let newState = store.state.applyTransaction(tx);

        if (newState === store.state) {
          return;
        }

        Store.updateState(store, newState, tx);

        callOrder.push(`afterUpdate[${tx.sourceSliceLineage}]`);
      },
    });

    store.dispatch(incrementActionE1());

    await waitUntil(store, (s) => {
      return e1.getState(s).num > 50;
    });
    store.destroy();

    expect(callOrder.slice(0, 20)).toMatchInlineSnapshot(`
      [
        "afterUpdate[l_e1$6]",
        "s1= 2,0",
        "afterUpdate[l_e1$6]",
        "s2= 4,0",
        "s1= 4,2",
        "afterUpdate[l_e1$6]",
        "s1= 6,4",
        "afterUpdate[l_e1$6]",
        "s2= 8,4",
        "s1= 8,6",
        "afterUpdate[l_e1$6]",
        "s1= 10,8",
        "afterUpdate[l_e1$6]",
        "s2= 12,8",
        "s1= 12,10",
        "afterUpdate[l_e1$6]",
        "s1= 14,12",
        "afterUpdate[l_e1$6]",
        "s2= 16,12",
        "s1= 16,14",
      ]
    `);
  });

  test('runs sync effects on a priority', async () => {
    let callOrder: string[] = [];

    const e1 = createBaseSlice([], {
      name: 'e1',
      initState: { num: 0 },
      derivedState: () => () => ({}),
    });

    const incrementActionE1 = Slice.createAction(
      e1,
      'increment',
      () => (state) => {
        return { ...state, num: state.num + 2 };
      },
    );

    Slice._registerEffect(e1, {
      updateSync(sl, store, prevState) {
        callOrder.push(
          's1-sync= ' +
            [sl.getState(store.state).num, sl.getState(prevState).num].join(
              ',',
            ),
        );
      },
      update(sl, store, prevState) {
        callOrder.push(
          's1= ' +
            [sl.getState(store.state).num, sl.getState(prevState).num].join(
              ',',
            ),
        );
        sl.getState(store.state);
        store.dispatch(incrementActionE1());
      },
    });

    const e2 = createBaseSlice([e1], {
      name: 'e2',
      initState: {
        num: 0,
      },
      derivedState: () => () => ({}),
    });

    Slice._registerEffect(e1, {
      updateSync(sl, store, prevState) {
        callOrder.push(
          's2-sync= ' +
            [e1.getState(store.state).num, e1.getState(prevState).num].join(
              ',',
            ),
        );
      },
      update(sl, store, prevState) {
        callOrder.push(
          's2= ' +
            [e1.getState(store.state).num, e1.getState(prevState).num].join(
              ',',
            ),
        );
      },
    });

    const store = Store.create({
      scheduler: timeoutSchedular(1),
      storeName: 'test-store',
      state: [e1, e2],
    });

    store.dispatch(incrementActionE1());

    await waitUntil(store, (s) => {
      return e1.getState(s).num > 50;
    });
    store.destroy();

    expect(callOrder.slice(0, 30)).toEqual([
      's1-sync= 2,0',
      's2-sync= 2,0',
      's1= 2,0',
      's1-sync= 4,2',
      's2-sync= 4,2',
      's2= 4,0',
      's1= 4,2',
      's1-sync= 6,4',
      's2-sync= 6,4',
      's1= 6,4',
      's1-sync= 8,6',
      's2-sync= 8,6',
      's2= 8,4',
      's1= 8,6',
      's1-sync= 10,8',
      's2-sync= 10,8',
      's1= 10,8',
      's1-sync= 12,10',
      's2-sync= 12,10',
      's2= 12,8',
      's1= 12,10',
      's1-sync= 14,12',
      's2-sync= 14,12',
      's1= 14,12',
      's1-sync= 16,14',
      's2-sync= 16,14',
      's2= 16,12',
      's1= 16,14',
      's1-sync= 18,16',
      's2-sync= 18,16',
    ]);
  });
});
