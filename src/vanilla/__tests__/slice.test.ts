import {
  createSelector,
  createSlice,
  createSliceWithSelectors,
} from '../create';
import { AnySlice, Slice } from '../slice';
import { StoreState } from '../state';
import { Transaction } from '../transaction';
import { expectType, rejectAny, TransactionBuilder } from '../types';
import { testOverrideDependencies } from '../../test-helpers/test-helpers';

const testSlice0 = createSlice([], {
  name: 'test-0',
  initState: {
    fancy: {
      object: 'with',
    },
  },
  actions: {},
});

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
    lord: (prefix: string) => (state) => {
      return { ...state, name: prefix + state.name + 'jesus' };
    },
  },
});

const depTestSlice1 = createSlice([testSlice1, testSlice0], {
  name: 'dep-test-1',
  initState: {
    myDep: 4,
    myDepStr: 'hi',
  },
  actions: {
    increment: () => (state, storeState) => {
      () => {
        // @ts-expect-error since testSlice2 is not a dependency
        testSlice2.getState(storeState).name;
      };

      rejectAny(storeState);
      rejectAny(state);

      expectType<StoreState<'test-0' | 'test-1'>>(storeState);
      expectType<{
        myDep: number;
        myDepStr: string;
      }>(state);

      return {
        ...state,
        myDep: state.myDep + 1 + testSlice1.getState(storeState).num,
      };
    },
  },
});

describe('dependencies', () => {
  describe('dep state', () => {
    const unknownSlice = createSlice([testSlice1], {
      name: 'unknown-test',
      initState: { num: 1 },
      actions: {},
    });

    const mySlice = createSlice([testSlice1, testSlice2], {
      name: 'my-test-slice',
      initState: { num: 1 },
      actions: {
        myAction: (num: number) => (state, storeState) => {
          let testVal1 = testSlice1.getState(storeState);

          let testVal2 = testVal1.num;
          expectType<number>(testVal2);

          // @ts-expect-error - should always error
          let testVal3 = testVal1.xyzWrong;

          return { ...state, num: num + state.num };
        },
        action2: () => (state, storeState) => {
          let testVal2 = testSlice2.getState(storeState);

          // @ts-expect-error - should always error
          let testVal3 = testVal2.xyzWrong;

          expectType<string>(testVal2.name);

          return { ...state, num: state.num + testVal2.name.length };
        },
      },
    });

    const state = StoreState.create([testSlice1, testSlice2, mySlice]);

    test('unknown slice should error', () => {
      expect(() =>
        // @ts-expect-error - slice is not registered should always error
        unknownSlice.getState(state),
      ).toThrowErrorMatchingInlineSnapshot(
        `"Slice "unknown-test" not found in store"`,
      );

      expect(() =>
        StoreState.getSliceState(state, unknownSlice),
      ).toThrowErrorMatchingInlineSnapshot(
        `"Slice "unknown-test" not found in store"`,
      );
    });
  });

  describe('cyclic deps', () => {
    const create = (key: string) => {
      return createSlice([], {
        name: key,
        actions: {},
        initState: {},
      });
    };

    test('cyclic dependencies 1', () => {
      const mySlice0 = createSlice([], {
        name: 'slice-0',
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

      const mySlice1 = createSlice([mySlice0], {
        name: 'my-slice-1',
        initState: {
          myDep: 4,
          myDepStr: 'hi',
        },
        actions: {},
      });

      const mySlice2 = createSlice([mySlice1], {
        name: 'my-slice-2',
        initState: {
          myDep: 4,
          myDepStr: 'hi',
        },
        actions: {},
      });

      expect(() =>
        StoreState.create([
          testOverrideDependencies(mySlice0, [mySlice2]),
          depTestSlice1,
          mySlice1,
          mySlice2,
        ]),
      ).toThrowErrorMatchingInlineSnapshot(
        `"Circular dependency detected in slice "l_slice-0$" with path l_slice-0$ ->l_my-slice-2$ ->l_my-slice-1$ ->l_slice-0$"`,
      );
    });

    test('cyclic dep 2', () => {
      const sl0 = create('sl0');
      const sl1 = create('sl1');
      const sl2 = create('sl2');
      const sl3 = create('sl3');
      const sl4 = create('sl4');

      // const modifyDeps = (slice: AnySlice, deps: AnySlice[]) => {
      //   slice.spec.dependencies = deps;
      // };

      testOverrideDependencies(sl0, [sl1, sl2]);
      testOverrideDependencies(sl1, [sl3]);
      testOverrideDependencies(sl2, [sl3]);
      testOverrideDependencies(sl3, [sl4]);
      testOverrideDependencies(sl4, [sl0, sl2]);

      expect(() =>
        StoreState.create([sl0, sl1, sl2, sl3, sl4]),
      ).toThrowErrorMatchingInlineSnapshot(
        `"Circular dependency detected in slice "l_sl0$" with path l_sl0$ ->l_sl1$ ->l_sl3$ ->l_sl4$ ->l_sl0$"`,
      );
    });
  });
});

describe('actions', () => {
  test('actions works', () => {
    expectType<(p: string) => Transaction<'test-2', string[]>>(
      testSlice2.actions.prefix,
    );

    expect(testSlice2.actions.prefix('me')).toMatchObject({
      config: {
        sourceSliceName: 'test-2',
      },
      targetSliceLineage: 'l_test-2$',
      payload: ['me'],
      actionId: 'prefix',
      uid: expect.any(String),
    });

    expectType<
      (p: number, p2: string) => Transaction<'test-2', Array<string | number>>
    >(testSlice2.actions.padEnd);

    // @ts-expect-error - since action does not exist should always error
    let wrong = testSlice2.actions.wrong?.();

    let tx = testSlice2.actions.prefix('me');

    expectType<Transaction<'test-2', Array<string | number>>>(tx);

    expect(testSlice2.actions.padEnd(6, 'me')).toMatchObject({
      config: {
        sourceSliceName: 'test-2',
      },
      payload: [6, 'me'],
      actionId: 'padEnd',
      uid: expect.any(String),
    });

    expectType<() => Transaction<'test-2', []>>(testSlice2.actions.uppercase);
    expect(testSlice2.actions.uppercase()).toMatchObject({
      config: {
        sourceSliceName: 'test-2',
      },
      payload: [],
      actionId: 'uppercase',
      uid: expect.any(String),
    });
  });

  test('parseRawActions works', () => {
    type StateType = { num: number };

    let mySlice = createSlice([testSlice1, testSlice2], {
      name: 'my-slice-1',
      initState: {
        num: 3,
      },
      actions: {
        myAction: (p: number) => (state, storeState) => {
          rejectAny(state);
          rejectAny(storeState);
          expectType<StateType>(state);

          let depState1 = testSlice1.getState(storeState);

          expectType<{ num: number }>(depState1);
          expectType<{ name: string }>(testSlice2.getState(storeState));

          //   @ts-expect-error - should always error
          let testVal = state.xyzWrong;

          return state;
        },
      },
    });

    let result = mySlice.actions.myAction;

    expectType<TransactionBuilder<'my-slice-1', [number]>>(result);

    expect(result(1)).toMatchInlineSnapshot(
      { uid: expect.any(String) },
      `
      {
        "actionId": "myAction",
        "config": {
          "actionId": "myAction",
          "payload": [
            1,
          ],
          "sourceSliceName": "my-slice-1",
          "targetSliceLineage": "l_my-slice-1$1",
        },
        "metadata": Metadata {
          "_metadata": {},
        },
        "payload": [
          1,
        ],
        "sourceSliceLineage": "l_my-slice-1$1",
        "targetSliceLineage": "l_my-slice-1$1",
        "uid": Any<String>,
      }
    `,
    );
  });

  test('throws error if depending on terminal slice', () => {
    let terminalSlice = createSlice([], {
      name: 'my-terminal-slice-1',
      initState: {
        num: 3,
      },
      actions: {},
      terminal: true,
    });

    expect(() =>
      createSlice([testSlice1, testSlice2, terminalSlice], {
        name: 'my-slice-1',
        actions: {},
        initState: {
          num: 3,
        },
      }),
    ).toThrowError(
      'A slice cannot have a dependency on a terminal slice. Remove "my-terminal-slice-1" from the dependencies of "my-slice-1".',
    );
  });
});

describe('selector', () => {
  test('works', () => {
    const mySlice = createSliceWithSelectors([], {
      name: 'my-test-slice',
      initState: { num: 3 },
      selectors: {
        numConditionalSquared: createSelector(
          {
            numSelected: (state) => state.num,
            isEven: (state) => state.num % 2 === 0,
          },
          ({ numSelected, isEven }) => {
            return isEven ? numSelected * numSelected : numSelected;
          },
        ),
      },
    });

    const updateNum = Slice.createAction(
      mySlice,
      'updateNum',
      (num: number) => {
        return (state) => {
          rejectAny(state);
          expectType<{ num: number }>(state);
          return {
            ...state,
            num,
          };
        };
      },
    );
    const state = StoreState.create([mySlice]);

    expectType<{ numConditionalSquared: number }>(mySlice.resolveState(state));

    let sliceState = mySlice.getState(state);

    // @ts-expect-error - should not allow access of unknown field in the state
    let testVal0 = sliceState.xyzWrong;

    expectType<{ num: number }>(sliceState);
    expect(sliceState.num).toBe(3);

    let resolvedState = mySlice.resolveState(state);

    rejectAny(resolvedState);

    expectType<{ numConditionalSquared: number; num: number }>(resolvedState);

    expect(resolvedState.numConditionalSquared).toEqual(3);

    let newState = state.applyTransaction(updateNum(4));

    expect(mySlice.resolveState(newState)).toEqual({
      numConditionalSquared: 16,
      num: 4,
    });

    newState = state.applyTransaction(updateNum(5));

    expect(mySlice.resolveState(newState)).toEqual({
      numConditionalSquared: 5,
      num: 5,
    });
  });

  test('selector works with dependencies', () => {
    const sliceA = createSlice([], {
      name: 'sliceA',
      initState: { sliceAVal: 3 },
      actions: {
        change: (val: number) => (state) => ({
          ...state,
          sliceAVal: val,
        }),
      },
    });

    const evenOddSlice = createSlice([], {
      name: 'evenOddSlice',
      initState: { checkEven: true },
      actions: {
        change: (type: 'even' | 'odd') => (state) => ({
          ...state,
          checkEven: type === 'even',
        }),
      },
    });

    const mySlice = createSliceWithSelectors([sliceA, evenOddSlice], {
      name: 'my-slice-test',
      initState: { count: 3 },
      selectors: {
        numSquared: createSelector(
          {
            count: (state) => state.count,
            sliceAVal: (state, storeState) => {
              const dep = sliceA.getState(storeState);
              return dep.sliceAVal;
            },
          },
          ({ count, sliceAVal }) => {
            return (count + sliceAVal) * (count + sliceAVal);
          },
        ),

        parityCountCheck: createSelector(
          {
            count: (state) => state.count,
            isEven: (state, storeState) => {
              return evenOddSlice.getState(storeState).checkEven;
            },
          },
          ({ count, isEven }) => {
            if (isEven) return count % 2 === 0;
            return count % 2 !== 0;
          },
        ),
      },
    });

    const myAction = Slice.createAction(mySlice, 'myAction', (num: number) => {
      return (state) => ({ ...state, num: num + state.count });
    });

    const action2 = Slice.createAction(
      mySlice,
      'myAction',
      (num: number, foo: string, brother: () => void) => {
        return (state) => ({ ...state, num: num + state.count });
      },
    );

    let state = StoreState.create([testSlice1, sliceA, evenOddSlice, mySlice]);

    let resolvedSelectors = mySlice.resolveState(state);

    expectType<{ numSquared: number; count: number }>(resolvedSelectors);

    let resolvedValued = mySlice.resolveState(state);

    expectType<{ count: number; numSquared: number }>(resolvedValued);

    expect(sliceA.resolveState(state)).toEqual({
      sliceAVal: 3,
    });
    expect(evenOddSlice.resolveState(state)).toEqual({
      checkEven: true,
    });
    expect(mySlice.resolveState(state)).toEqual({
      count: 3,
      numSquared: 36,
      parityCountCheck: false,
    });

    state = state.applyTransaction(evenOddSlice.actions.change('odd'));

    // since we check for odd, and count is 3
    expect(mySlice.resolveState(state)).toEqual({
      count: 3,
      numSquared: 36,
      parityCountCheck: true,
    });

    state = state.applyTransaction(evenOddSlice.actions.change('even'));

    // since we check for odd, and count is 3
    expect(mySlice.resolveState(state)).toEqual({
      count: 3,
      numSquared: 36,
      parityCountCheck: false,
    });

    state = state.applyTransaction(sliceA.actions.change(4));

    expect(mySlice.resolveState(state)).toEqual({
      count: 3,
      numSquared: 49,
      parityCountCheck: false,
    });

    state = state.applyTransaction(sliceA.actions.change(5));

    expect(mySlice.resolveState(state)).toEqual({
      count: 3,
      numSquared: 64,
      parityCountCheck: false,
    });
  });
});
