import { createBaseSlice, createSlice } from '../create';
import { timeoutSchedular } from '../effect';
import { Slice } from '../slice';

import { StoreState } from '../state';
import { ReducedStore, Store } from '../store';
import { TX_META_DISPATCH_INFO, TX_META_STORE_NAME } from '../transaction';
import { waitUntil } from '../../test-helpers/test-helpers';

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

const testSlice3 = createBaseSlice([], {
  name: 'test-3',
  initState: {
    name: 'tame',
  },
  derivedState: () => () => {},
});

const testSlice3Lowercase = Slice.createAction(
  testSlice3,
  'lowercase',
  () => (state) => ({
    ...state,
    name: state.name.toLocaleLowerCase(),
  }),
);

const testSlice3Uppercase = Slice.createAction(
  testSlice3,
  'uppercase',
  () => (state) => {
    return { ...state, name: state.name.toUpperCase() };
  },
);
Slice._registerEffect(testSlice3, {
  name: 'to-lowercase',
  updateSync(sl, store) {
    if (sl.getState(store.state).name === 'TAME') {
      store.dispatch(testSlice3Lowercase());
    }
  },
});

describe('store', () => {
  test('disable effect works', async () => {
    const called = jest.fn();
    let mySlice = createBaseSlice([testSlice1], {
      name: 'mySlice',
      initState: {
        found: false,
      },
      derivedState: () => () => {},
    });

    Slice._registerEffect(mySlice, {
      name: 'counter-update',
      updateSync(sl, store) {
        called();
      },
    });

    let disabledEffectSlice = Slice.disableEffects(mySlice);

    expect(mySlice.config.disableEffects).toBe(false);
    expect(disabledEffectSlice.config.disableEffects).toBe(true);

    const myStore = Store.create({
      storeName: 'myStore',
      scheduler: timeoutSchedular(0),
      state: [testSlice1, testSlice2, testSlice3, disabledEffectSlice],
    });

    myStore.dispatch(testSlice1.actions.increment({ increment: true }));

    await Promise.resolve();

    expect(called).toBeCalledTimes(0);
  });
  test('works', () => {
    const myStore = Store.create({
      storeName: 'myStore',
      scheduler: timeoutSchedular(0),
      state: [testSlice1, testSlice2, testSlice3],
    });

    const tx = testSlice1.actions.increment({ increment: true });

    myStore.dispatch(tx, 'test-location');

    expect(tx.metadata.getMetadata(TX_META_STORE_NAME)).toBe('myStore');
    expect(tx.metadata.getMetadata(TX_META_DISPATCH_INFO)).toBe(
      'test-location',
    );

    const tx2 = testSlice1.actions.increment({ increment: true });

    myStore.dispatch(tx2);

    expect(tx2.uid?.includes('-')).toBe(true);
  });

  test('logs', async () => {
    let log: any[] = [];
    const myStore = Store.create({
      storeName: 'myStore',
      scheduler: timeoutSchedular(0),
      state: [testSlice1, testSlice2, testSlice3],
      debug(item) {
        log.push(item);
      },
    });

    myStore.dispatch(testSlice1.actions.increment({ increment: true }));

    expect(
      log.map((r) => {
        return { ...r, txId: '<<TX_ID>>' };
      }),
    ).toMatchInlineSnapshot(`
      [
        {
          "actionId": "increment",
          "payload": [
            {
              "increment": true,
            },
          ],
          "sourceSliceLineage": "l_test-1$",
          "store": "myStore",
          "targetSliceLineage": "l_test-1$",
          "txId": "<<TX_ID>>",
          "type": "TX",
        },
      ]
    `);

    myStore.dispatch(testSlice3Uppercase());

    await Promise.resolve();

    expect(log.slice(1)).toEqual([
      {
        actionId: 'uppercase',
        payload: [],
        sourceSliceLineage: 'l_test-3$',
        targetSliceLineage: 'l_test-3$',
        store: 'myStore',
        txId: expect.any(String),
        type: 'TX',
      },

      {
        name: 'to-lowercase',
        source: [
          {
            actionId: 'uppercase',
            lineageId: 'l_test-3$',
          },
        ],
        type: 'SYNC_UPDATE_EFFECT',
      },
      {
        actionId: 'lowercase',
        dispatcher: 'l_test-3$',
        payload: [],
        sourceSliceLineage: 'l_test-3$',
        targetSliceLineage: 'l_test-3$',
        store: 'myStore',
        txId: expect.any(String),
        type: 'TX',
      },
      {
        name: 'to-lowercase',
        source: [
          {
            actionId: 'lowercase',
            lineageId: 'l_test-3$',
          },
        ],
        type: 'SYNC_UPDATE_EFFECT',
      },
    ]);
  });
});

describe('ReducedStore', () => {
  test('works', () => {
    const myStore = Store.create({
      storeName: 'myStore',
      scheduler: timeoutSchedular(0),
      state: [testSlice1, testSlice2, testSlice3],
    });
    const reducedStore1 = new ReducedStore(myStore, testSlice1);

    reducedStore1.dispatch(testSlice1.actions.increment({ increment: true }));

    myStore.dispatch(testSlice2.actions.uppercase());

    myStore.dispatch(testSlice3Lowercase());

    expect(() =>
      // @ts-expect-error -  since testSlice3 is not included in reduced store
      testSlice3.getState(reducedStore1.state),
    ).toThrowErrorMatchingInlineSnapshot(
      `"Slice "test-3" is not included in the dependencies of the scoped slice "test-1""`,
    );

    expect(() =>
      // @ts-expect-error -  since testSlice3 is not included in reduced store
      reducedStore1.dispatch(testSlice3Uppercase()),
    ).toThrowErrorMatchingInlineSnapshot(
      `"Dispatch not allowed! Slice "test-1" does not include "test-3" in its dependency."`,
    );

    expect(testSlice1.getState(reducedStore1.state)).toEqual(
      testSlice1.getState(myStore.state),
    );

    const reducedStore2 = new ReducedStore(myStore, testSlice2);

    expect(testSlice2.getState(reducedStore2.state)).toEqual(
      testSlice2.getState(myStore.state),
    );
  });

  test('destroying works', () => {
    const myStore = Store.create({
      storeName: 'myStore',
      scheduler: timeoutSchedular(0),
      state: [testSlice1, testSlice2, testSlice3],
    }) as Store;
    const reducedStore = Store.getReducedStore(myStore, testSlice1);

    reducedStore.destroy();

    expect(reducedStore.destroyed).toBe(true);
    expect(myStore.destroyed).toBe(true);
  });

  test('reduced store props', async () => {
    let providedStore: any | null = null;
    let providedPrevState: ReducedStore<any>['state'] | null = null;
    const mySlice = createBaseSlice([], {
      name: 'my-slice',
      initState: { num: 4 },
      derivedState: () => () => ({}),
    });
    const addOne = Slice.createAction(mySlice, 'addOne', () => (state) => ({
      ...state,
      num: state.num + 1,
    }));

    Slice._registerEffect(mySlice, {
      update: (sl, store) => {
        providedStore = store;
        providedPrevState = store.state;
      },
    });

    const myStore = Store.create({
      storeName: 'myStore',
      scheduler: timeoutSchedular(0),
      state: [testSlice1, testSlice2, testSlice3, mySlice],
    });

    const redStore = Store.getReducedStore(myStore, mySlice);

    redStore.dispatch(addOne());

    await waitUntil(Store.getReducedStore(myStore, mySlice), (state) => {
      return mySlice.getState(state).num === 5;
    });

    expect(providedPrevState).toBeInstanceOf(StoreState);
    expect(mySlice.getState(providedPrevState!)).toMatchInlineSnapshot(`
      {
        "num": 5,
      }
    `);
  });
});
