import { waitUntil } from '../../test-helpers';
import { coreReadySlice } from '../core-effects';
import { createKey, slice } from '../create';
import { timeoutSchedular } from '../effect';
import { InternalStoreState } from '../state';
import { ReducedStore, Store } from '../store';
import {
  TX_META_DISPATCH_SOURCE,
  TX_META_STORE_NAME,
  TX_META_STORE_TX_ID,
} from '../transaction';

const testSlice1 = slice({
  key: createKey('test-1', [], { num: 4 }),
  actions: {
    increment: (opts: { increment: boolean }) => (state) => {
      return { ...state, num: state.num + (opts.increment ? 1 : 0) };
    },
    decrement: (opts: { decrement: boolean }) => (state) => {
      return { ...state, num: state.num - (opts.decrement ? 1 : 0) };
    },
  },
});

const testSlice2 = slice({
  key: createKey('test-2', [], { name: 'tame' }),
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

const testSlice3 = slice({
  key: createKey('test-3', [], { name: 'tame' }),
  actions: {
    lowercase: () => (state) => {
      return { ...state, name: state.name.toLocaleLowerCase() };
    },
    uppercase: () => (state) => {
      return { ...state, name: state.name.toUpperCase() };
    },
  },
  effects: [
    {
      name: 'to-lowercase',
      updateSync(sl, store) {
        if (sl.getState(store.state).name === 'TAME') {
          store.dispatch(sl.actions.lowercase());
        }
      },
    },
  ],
});

describe('store', () => {
  test('works', () => {
    const myStore = Store.create({
      storeName: 'myStore',
      scheduler: timeoutSchedular(0),
      state: [testSlice1, testSlice2, testSlice3],
    });

    const tx = testSlice1.actions.increment({ increment: true });

    myStore.dispatch(tx, 'test-location');

    expect(tx.metadata.getMetadata(TX_META_STORE_TX_ID)?.endsWith('-0')).toBe(
      true,
    );
    expect(tx.metadata.getMetadata(TX_META_STORE_NAME)).toBe('myStore');
    expect(tx.metadata.getMetadata(TX_META_DISPATCH_SOURCE)).toBe(
      'test-location',
    );

    const tx2 = testSlice1.actions.increment({ increment: true });

    myStore.dispatch(tx2);

    expect(tx2.metadata.getMetadata(TX_META_STORE_TX_ID)?.endsWith('-1')).toBe(
      true,
    );
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
        return { ...r, txId: 'rand' + r.txId.slice(4) };
      }),
    ).toMatchInlineSnapshot(`
      [
        {
          "actionId": "increment",
          "dispatcher": undefined,
          "payload": [
            {
              "increment": true,
            },
          ],
          "sourceSliceKey": "test-1",
          "store": "myStore",
          "targetSliceKey": "test-1",
          "txId": "rand-3",
          "type": "TX",
        },
      ]
    `);

    myStore.dispatch(testSlice3.actions.uppercase());

    await Promise.resolve();

    expect(log.slice(1)).toEqual([
      {
        actionId: 'uppercase',
        dispatcher: undefined,
        payload: [],
        sourceSliceKey: 'test-3',
        targetSliceKey: 'test-3',
        store: 'myStore',
        txId: expect.any(String),
        type: 'TX',
      },
      {
        actionId: 'ready',
        dispatcher: undefined,
        payload: [],
        sourceSliceKey: coreReadySlice.newKeyNew,
        targetSliceKey: coreReadySlice.newKeyNew,
        store: 'myStore',
        txId: expect.any(String),
        type: 'TX',
      },
      {
        name: 'to-lowercase',
        source: [
          {
            actionId: 'uppercase',
            sliceKey: 'test-3',
          },
        ],
        type: 'SYNC_UPDATE_EFFECT',
      },
      {
        actionId: 'lowercase',
        dispatcher: 'to-lowercase',
        payload: [],
        sourceSliceKey: 'test-3',
        targetSliceKey: 'test-3',
        store: 'myStore',
        txId: expect.any(String),
        type: 'TX',
      },
      {
        name: '<unknownEffect>',
        source: [
          {
            actionId: 'ready',
            sliceKey: coreReadySlice.newKeyNew,
          },
        ],
        type: 'SYNC_UPDATE_EFFECT',
      },
      {
        name: 'to-lowercase',
        source: [
          {
            actionId: 'lowercase',
            sliceKey: 'test-3',
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
    const reducedStore = new ReducedStore(myStore, '', {
      sliceKey: testSlice1.newKeyNew,
    });

    reducedStore.dispatch(testSlice1.actions.increment({ increment: true }));

    myStore.dispatch(testSlice2.actions.uppercase());

    myStore.dispatch(testSlice3.actions.lowercase());

    expect(testSlice3.getState(reducedStore.state)).toEqual(
      testSlice3.getState(myStore.state),
    );

    expect(testSlice1.getState(reducedStore.state)).toEqual(
      testSlice1.getState(myStore.state),
    );

    expect(testSlice2.getState(reducedStore.state)).toEqual(
      testSlice2.getState(myStore.state),
    );
  });

  test('destroying works', () => {
    const myStore = Store.create({
      storeName: 'myStore',
      scheduler: timeoutSchedular(0),
      state: [testSlice1, testSlice2, testSlice3],
    }) as Store;
    const reducedStore = myStore.getReducedStore('debug', {
      sliceKey: testSlice1.newKeyNew,
    });

    reducedStore.destroy();

    expect(reducedStore.destroyed).toBe(true);
    expect(myStore.destroyed).toBe(true);
  });

  test('reduced store props', async () => {
    let providedStore: any | null = null;
    let providedPrevState: ReducedStore<any>['state'] | null = null;
    const mySlice = slice({
      key: createKey('my-slice', [], { num: 4 }),
      actions: {
        addOne: () => (state) => ({ ...state, num: state.num + 1 }),
      },
      effects: [
        {
          update: (sl, store, prevState) => {
            providedStore = store;
            providedPrevState = store.state;
          },
        },
      ],
    });

    const myStore = Store.create({
      storeName: 'myStore',
      scheduler: timeoutSchedular(0),
      state: [testSlice1, testSlice2, testSlice3, mySlice],
    });

    const redStore = (myStore as Store).getReducedStore('', {
      sliceKey: testSlice1.newKeyNew,
    });

    redStore.dispatch(mySlice.actions.addOne());

    await waitUntil(
      (myStore as Store).getReducedStore('', {
        sliceKey: testSlice1.newKeyNew,
      }),
      (state) => {
        return mySlice.getState(state).num === 5;
      },
    );

    // expect(providedStore.state).toEqual(myStore.state);
    expect(providedPrevState).toBeInstanceOf(InternalStoreState);
    expect(mySlice.getState(providedPrevState!)).toMatchInlineSnapshot(`
      {
        "num": 5,
      }
    `);
  });
});
