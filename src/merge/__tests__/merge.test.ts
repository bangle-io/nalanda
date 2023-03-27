import {
  createDispatchSpy,
  createSlice,
  Store,
  Transaction,
} from '../../vanilla';
import { expectType, rejectAny } from '../../vanilla/internal-types';
import { TxCreator } from '../../vanilla/public-types';
import { mergeAll } from '../merge';

const testSlice1 = createSlice([], {
  initState: {
    num: 0,
  },
  name: 'test-1',
  selectors: {
    doubleNum: (state) => state.num * 2,
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
    name2: 'tame',
  },
  selectors: {},
  actions: {
    prefix: (prefix: string) => (state) => {
      return { ...state, name2: prefix + state.name2 };
    },
    padEnd: (length: number, pad: string) => (state) => {
      return { ...state, name2: state.name2.padEnd(length, pad) };
    },
    uppercase: () => (state) => {
      return { ...state, name2: state.name2.toUpperCase() };
    },
  },
});

const testSlice3 = createSlice([testSlice2], {
  name: 'test-3',
  initState: {
    name3: 'TAME',
  },
  selectors: {},
  actions: {
    lowercase: () => (state) => {
      return { ...state, name3: state.name3.toLocaleLowerCase() };
    },
  },
});

describe('single slice', () => {
  test('sets up correctly', () => {
    const forwarded = mergeAll([testSlice1], {
      name: 'test-1-merged',
    });

    expect(forwarded.spec.dependencies[0]).toBe(testSlice1);
    expect(forwarded.spec.forwardMap).toMatchInlineSnapshot(`
          {
            "decrement": "l_test-1$",
            "increment": "l_test-1$",
          }
      `);

    expectType<
      TxCreator<
        'test-1-merged',
        [
          opts: {
            increment: boolean;
          },
        ]
      >
    >(forwarded.actions.increment);

    expect(forwarded.actions.increment({ increment: true })).toMatchObject({
      actionId: 'increment',
      sourceSliceLineage: 'l_test-1-merged$1',
      targetSliceLineage: 'l_test-1$',
      payload: [
        {
          increment: true,
        },
      ],
    });
  });

  test('updates the state', () => {
    const forwarded = mergeAll([testSlice1], {
      name: 'test-1-merged',
    });

    const store = Store.create({
      storeName: 'test-store',
      state: [forwarded],
    });

    store.dispatch(forwarded.actions.increment({ increment: true }));

    expect(forwarded.resolveState(store.state)).toMatchInlineSnapshot(`
      {
        "doubleNum": 2,
        "num": 1,
      }
    `);

    store.dispatch(forwarded.actions.increment({ increment: true }));

    expect(forwarded.resolveState(store.state)).toMatchInlineSnapshot(`
      {
        "doubleNum": 4,
        "num": 2,
      }
    `);
  });
});

describe('forwarding three slices', () => {
  test('sets up correctly', () => {
    const forwarded = mergeAll([testSlice1, testSlice2, testSlice3], {
      name: 'test-1-merged',
    });

    expect(forwarded.spec.dependencies[0]).toBe(testSlice1);
    expect(forwarded.spec.dependencies[1]).toBe(testSlice2);
    expect(forwarded.spec.dependencies[2]).toBe(testSlice3);
    expect(forwarded.spec.forwardMap).toMatchInlineSnapshot(`
      {
        "decrement": "l_test-1$",
        "increment": "l_test-1$",
        "lowercase": "l_test-3$",
        "padEnd": "l_test-2$",
        "prefix": "l_test-2$",
        "uppercase": "l_test-2$",
      }
    `);

    rejectAny(forwarded.actions);
    rejectAny(forwarded.actions.increment);

    expectType<
      TxCreator<
        'test-1-merged',
        [
          opts: {
            increment: boolean;
          },
        ]
      >
    >(forwarded.actions.increment);

    expect(
      forwarded.actions.increment({ increment: true }),
    ).toMatchInlineSnapshot(
      { uid: expect.any(String) },
      `
      {
        "actionId": "increment",
        "config": {
          "actionId": "increment",
          "payload": [
            {
              "increment": true,
            },
          ],
          "sourceSliceLineage": "l_test-1-merged$3",
          "sourceSliceName": "test-1-merged",
          "targetSliceLineage": "l_test-1$",
        },
        "metadata": Metadata {
          "_metadata": {},
        },
        "payload": [
          {
            "increment": true,
          },
        ],
        "sourceSliceLineage": "l_test-1-merged$3",
        "targetSliceLineage": "l_test-1$",
        "uid": Any<String>,
      }
    `,
    );
  });

  test('updates the state', () => {
    const forwarded = mergeAll([testSlice1, testSlice2, testSlice3], {
      name: 'test-1-merged',
    });

    const store = Store.create({
      storeName: 'test-store',
      state: [forwarded],
    });

    store.dispatch(forwarded.actions.increment({ increment: true }));

    expect(forwarded.resolveState(store.state)).toMatchInlineSnapshot(`
      {
        "doubleNum": 2,
        "name2": "tame",
        "name3": "TAME",
        "num": 1,
      }
    `);

    store.dispatch(forwarded.actions.increment({ increment: true }));

    expect(forwarded.resolveState(store.state)).toMatchInlineSnapshot(`
      {
        "doubleNum": 4,
        "name2": "tame",
        "name3": "TAME",
        "num": 2,
      }
    `);
  });
});

describe('nested forwarding', () => {
  const forwarded1 = mergeAll([testSlice1, testSlice3], {
    name: 'test-1-merged',
  });

  const forwarded2 = mergeAll([testSlice2, forwarded1], {
    name: 'test-2-merged',
  });

  const forwarded3 = mergeAll([forwarded2], {
    name: 'test-3-merged',
  });

  test('builds correct map', () => {
    expect(forwarded2.spec.forwardMap).toMatchInlineSnapshot(`
      {
        "decrement": "l_test-1$",
        "increment": "l_test-1$",
        "lowercase": "l_test-3$",
        "padEnd": "l_test-2$",
        "prefix": "l_test-2$",
        "uppercase": "l_test-2$",
      }
    `);
    expect(forwarded3.spec.forwardMap).toMatchInlineSnapshot(`
      {
        "decrement": "l_test-1$",
        "increment": "l_test-1$",
        "lowercase": "l_test-3$",
        "padEnd": "l_test-2$",
        "prefix": "l_test-2$",
        "uppercase": "l_test-2$",
      }
    `);
  });

  test('throws error if froward 3 is not registered', () => {
    const store = Store.create({
      storeName: 'test-store',
      state: [forwarded2],
    });

    expect(
      // @ts-expect-error - store does not have forward 3
      () => store.dispatch(forwarded3.actions.increment({ increment: true })),
    ).toThrowErrorMatchingInlineSnapshot(
      `"Cannot dispatch transaction as slice "l_test-3-merged$" is not registered in Store"`,
    );
  });

  test('state update works', () => {
    const store = Store.create({
      storeName: 'test-store',
      state: [forwarded3],
    });

    store.dispatch(forwarded3.actions.increment({ increment: true }));

    expect(forwarded3.resolveState(store.state)).toMatchInlineSnapshot(`
      {
        "doubleNum": 2,
        "name2": "tame",
        "name3": "TAME",
        "num": 1,
      }
    `);

    store.dispatch(forwarded3.actions.increment({ increment: true }));
    store.dispatch(forwarded3.actions.lowercase());

    expect(forwarded3.resolveState(store.state)).toMatchInlineSnapshot(`
      {
        "doubleNum": 4,
        "name2": "tame",
        "name3": "tame",
        "num": 2,
      }
    `);

    store.dispatch(forwarded3.actions.padEnd(6, 'k'));

    expect(forwarded3.resolveState(store.state)).toMatchInlineSnapshot(`
      {
        "doubleNum": 4,
        "name2": "tamekk",
        "name3": "tame",
        "num": 2,
      }
    `);
  });

  describe('multiple slices with effects', () => {
    const g1 = createSlice([], {
      name: 'g1',
      initState: {
        g1: 'g',
      },
      actions: {
        updateG1State: () => (state) => ({
          ...state,
          g1State: state.g1 + 'g',
        }),
      },
      selectors: {
        g1Selector: (state) => `g: (${state.g1})`,
      },
    });

    const t1 = createSlice([g1], {
      name: 't1',
      initState: {
        t1: 't',
      },
      selectors: {
        t1Selector: (state, storeState) =>
          `t1: ((${state.t1})(${g1.getState(storeState).g1})))`,
      },
      actions: {
        updateT1State: () => (state) => ({
          ...state,
          t1: state.t1 + 't',
        }),
      },
    });

    const r1 = createSlice([t1], {
      name: 'r1',
      initState: {
        r1: 'r',
      },
      actions: {
        updateR1State: () => (state) => ({
          ...state,
          r1: state.r1 + 'r',
        }),
      },
      selectors: {
        r1Selector: (state, storeState) => {
          return `r1: ((${state.r1})(${t1.getState(storeState).t1})))`;
        },
      },
    }).addEffect({
      name: 't2Effect',
      updateSync(slice, store, prevStoreState) {
        if (t1.getState(store.state).t1.length === 2) {
          store.dispatch(t1.actions.updateT1State());
        }

        if (slice.getState(store.state).r1.length === 1) {
          store.dispatch(r1.actions.updateR1State());
        }
      },
    });

    const s1 = createSlice([], {
      name: 's1',
      initState: {
        s1: 0,
      },
      actions: {},
      selectors: {
        isZero: (state, storeState) => {
          return state.s1 === 0;
        },
      },
    });

    const x0 = mergeAll([g1, t1, r1, s1], {
      name: 'x0',
    });

    const z0 = mergeAll([x0], {
      name: 'z0',
    });

    test('state looks okay', async () => {
      let dispatchSpy = createDispatchSpy();
      const store = Store.create({
        dispatchTx: dispatchSpy.dispatch,
        debug: dispatchSpy.debug,
        storeName: 'test-store',
        state: [z0],
      });

      store.dispatch(z0.actions.updateT1State());
      rejectAny(z0.actions);
      expectType<{
        updateT1State: any;
        updateR1State: any;
        updateG1State: any;
      }>(z0.actions);

      expectType<Transaction<'z0', any[]>>(z0.actions.updateT1State());
      expectType<Transaction<'z0', any[]>>(z0.actions.updateR1State());
      expectType<Transaction<'z0', any[]>>(z0.actions.updateT1State());

      expect((store.state as any).slicesCurrentState).toMatchInlineSnapshot(`
        {
          "key_g1": {
            "g1": "g",
          },
          "key_r1": {
            "r1": "r",
          },
          "key_s1": {
            "s1": 0,
          },
          "key_t1": {
            "t1": "tt",
          },
          "key_x0": {},
          "key_z0": {},
        }
      `);

      // just to test types
      () => {
        let test = x0.resolveState({} as any);
        rejectAny(test);
        expectType<{
          g1: string;
          s1: number;
          isZero: boolean;
        }>(test);
      };

      let resolvedState = z0.resolveState(store.state);

      rejectAny(resolvedState);

      expectType<{
        g1: string;
        s1: number;
        isZero: boolean;
        g1Selector: string;
        t1Selector: string;
      }>(resolvedState);

      expect(z0.resolveState(store.state)).toMatchInlineSnapshot(`
        {
          "g1": "g",
          "g1Selector": "g: (g)",
          "isZero": true,
          "r1": "r",
          "r1Selector": "r1: ((r)(tt)))",
          "s1": 0,
          "t1": "tt",
          "t1Selector": "t1: ((tt)(g)))",
        }
      `);

      await new Promise((res) => setTimeout(res, 20));

      //  effects should trigger
      expect(z0.resolveState(store.state).r1).toBe('rr');
      expect(z0.resolveState(store.state).t1).toBe('ttt');
    });
  });
});
