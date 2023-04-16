import { testOverrideDependencies } from '../../test-helpers';
import { createKey, createSlice, slice } from '../create';
import { createLineageId, expectType } from '../internal-types';
import { checkUniqueLineage } from '../slices-helpers';
import { StoreState } from '../state';
import { Transaction } from '../transaction';

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

const depTestSlice1 = slice({
  key: createKey('dep-test-1', [testSlice1], { myDep: 4, myDepStr: 'hi' }),
  actions: {
    increment: () => (state, storeState) => ({
      ...state,
      myDep: state.myDep + 1 + testSlice1.getState(storeState).num,
    }),
  },
});

describe('applyTransaction', () => {
  test('applyTransaction works', () => {
    const mySlice = slice({
      key: createKey('test', [], { num: 1 }),
      actions: {
        myAction: (num: number) => (state) => {
          return { ...state, num: num + state.num };
        },
        action2: (num: number, foo: string, brother: () => void) => (state) =>
          state,
      },
    });

    const state = StoreState.create([mySlice]);

    // @ts-expect-error - should error when a field is not defined
    let testVal0 = mySlice.actions.myAction(5).randomValue;

    expectType<number[]>(mySlice.actions.myAction(5).payload);
    expectType<[number, string, () => void]>(
      mySlice.actions.action2(5, 'str', () => {
        return;
      }).payload,
    );

    expect(mySlice.actions.myAction(5).payload).toEqual([5]);
    expect(
      mySlice.actions.action2(5, 'str', () => {
        return;
      }).payload,
    ).toEqual([5, 'str', expect.any(Function)]);

    const newState = state.applyTransaction(mySlice.actions.myAction(5))!;

    expect(mySlice.getState(newState)).toEqual({
      num: 6,
    });
  });

  test('applyTransaction works with dependencies', () => {
    const sliceDep1 = slice({
      key: createKey('test-dep1', [], { num: 50 }),
      actions: {},
    });
    const sliceDep2 = slice({
      key: createKey('test-dep2', [], { num: 3 }),
      actions: {},
    });

    const mySlice = slice({
      key: createKey('test', [sliceDep1, sliceDep2], { num: 1 }),
      actions: {
        myAction: (num: number) => (state, storeState) => {
          // @ts-expect-error - should not allow access of any unknown field in the state
          let testVal1 = state.xyzWrong;

          let dep1 = sliceDep1.getState(storeState);

          // @ts-expect-error - should not allow access of any unknown field in the state
          let testVal2 = dep1.xyzWrong;

          let dep2 = sliceDep2.getState(storeState);

          return {
            ...state,
            num: num + state.num + dep1.num + dep2.num,
          };
        },
      },
    });

    const state = StoreState.create([sliceDep1, sliceDep2, mySlice]);

    const newState = state.applyTransaction(mySlice.actions.myAction(5));

    const result = mySlice.getState(newState);

    // @ts-expect-error - should error when a field is not defined
    let testVal0 = result.xyz;

    expectType<{ num: number } | undefined>(result);

    expect(mySlice.getState(newState)).toEqual({
      num: 50 + 1 + 5 + 3,
    });
  });
});

describe('validations', () => {
  test('throws error if slice key not unique', () => {
    const mySlice = slice({
      key: createKey('test', [], { num: 1 }),
      actions: {
        myAction: (num: number) => (state) => {
          return { ...state, num: num + state.num };
        },
      },
    });

    const mySlice2 = slice({
      key: createKey('test', [], { num: 1 }),
      actions: {
        myAction: (num: number) => (state) => {
          return { ...state, num: num + state.num };
        },
      },
    });

    expect(() => {
      StoreState.create([mySlice, mySlice2]);
    }).toThrowErrorMatchingInlineSnapshot(`"Duplicate slice keys key_test"`);
  });

  test('throws error if slice dependency is not registered', () => {
    const sliceDep = slice({
      key: createKey('test-dep', [], { num: 1 }),
      actions: {},
    });
    const mySlice = slice({
      key: createKey('test', [sliceDep], { num: 1 }),
      actions: {
        myAction: (num: number) => (state) => {
          return { ...state, num: num + state.num };
        },
      },
    });

    expect(() => {
      StoreState.create([mySlice]);
    }).toThrowErrorMatchingInlineSnapshot(
      `"Slice "l_test$4" has a dependency on Slice "l_test-dep$" which is either not registered or is registered after this slice."`,
    );
  });

  test('throws error if slice dependency is not registered before', () => {
    const sliceDep = slice({
      key: createKey('test-dep', [], { num: 1 }),
      actions: {},
    });
    const mySlice = slice({
      key: createKey('test', [sliceDep], { num: 1 }),
      actions: {
        myAction: (num: number) => (state) => {
          return { ...state, num: num + state.num };
        },
      },
    });

    expect(() => {
      StoreState.create([mySlice, sliceDep]);
    }).toThrowErrorMatchingInlineSnapshot(
      `"Slice "l_test$5" has a dependency on Slice "l_test-dep$1" which is either not registered or is registered after this slice."`,
    );
  });

  test('throws error if duplicate lineage ids', () => {
    const slice1 = createSlice([], {
      name: 'slice1',
      actions: {},
      initState: { num: 1 },
      selector: () => {},
    });

    const slice2 = slice1.withoutEffects();

    expect(() => checkUniqueLineage([slice1, slice2])).toThrowError(
      /^Duplicate slice lineageIds l_slice1/,
    );
  });
});

describe('test override helper', () => {
  test('overriding init state works', () => {
    const slice1 = slice({
      key: createKey('test1', [], { num: 1 }),
      actions: {},
    });

    const slice2 = slice({
      key: createKey('test2', [], { num: 2 }),
      actions: {},
    });

    let newState1 = StoreState.create([slice1, slice2], {
      [slice2.lineageId]: { num: 99 },
    });

    expect(slice1.getState(newState1)).toEqual({ num: 1 });
    expect(slice2.getState(newState1)).toEqual({ num: 99 });

    let newState2 = StoreState.create([slice1, slice2], {
      [slice1.lineageId]: { num: -1 },
    });

    expect(slice1.getState(newState2)).toEqual({ num: -1 });
    expect(slice1.getState(newState1)).toEqual({ num: 1 });
  });

  test('overriding effects works', () => {
    const slice1 = slice({
      key: createKey('test1', [], { num: 1 }),
      actions: {},
      effects: [
        {
          update: (sl) => {
            return;
          },
        },
      ],
    }).withoutEffects();

    expect(slice1.spec.effects).toHaveLength(0);
  });

  test('overriding dependencies', () => {
    const slice1 = slice({
      key: createKey('test1', [], { num: 1 }),
      actions: {},
    });

    expect(
      testOverrideDependencies(slice1, { dependencies: [testSlice1] }).spec
        .dependencies.length,
    ).toBe(1);

    expect(slice1.spec.dependencies.length).toBe(0);
  });
});

describe('State creation', () => {
  test('empty slices', () => {
    const appState = StoreState.create([]);

    expect(appState).toMatchInlineSnapshot(`
      StoreState {
        "_slices": [],
        "config": {
          "lineageToStable": {},
          "lookupByLineage": {},
          "stableToLineage": {},
        },
        "opts": {},
        "slicesCurrentState": {},
      }
    `);
  });

  test('with a slice', () => {
    const mySlice = slice({
      key: createKey('mySlice', [], { val: null }),
      actions: {},
    });

    const appState = StoreState.create([mySlice]);

    expect(mySlice.getState(appState)).toEqual({ val: null });
    expect(appState).toEqual({
      _slices: expect.any(Array),
      opts: {},
      config: {
        stableToLineage: { [mySlice.name]: mySlice.lineageId },
        lineageToStable: {
          l_mySlice$: 'mySlice',
        },
        lookupByLineage: {
          l_mySlice$: mySlice,
        },
      },
      slicesCurrentState: {
        [mySlice.lineageId]: {
          val: null,
        },
      },
    });
  });

  test('throws error if action not found', () => {
    const mySlice = slice({
      key: createKey('mySlice', [], { val: null }),
      actions: {},
    });

    const appState = StoreState.create([mySlice]);

    expect(() =>
      appState.applyTransaction(
        new Transaction({
          sourceSliceName: 'mySlice',
          targetSliceLineage: mySlice.lineageId,
          payload: [5],
          actionId: 'updateNum',
        }),
      ),
    ).toThrowError(`Action "updateNum" not found in Slice "mySlice"`);
  });

  test('applying action preserves states of those who donot have apply', () => {
    const mySlice = slice({
      key: createKey('mySlice', [], { num: 0 }),
      actions: {},
    });

    const mySlice2 = slice({
      key: createKey('mySlice2', [mySlice], { num: 0 }),
      actions: {
        updateNum: (num: number) => (state, storeState) => {
          return { ...state, num };
        },
      },
    });

    const appState = StoreState.create([mySlice, mySlice2]);
    expect(mySlice.getState(appState).num).toBe(0);

    let newAppState = appState.applyTransaction(mySlice2.actions.updateNum(4));
    expect(mySlice.getState(newAppState).num).toBe(0);
    expect(mySlice2.getState(newAppState).num).toBe(4);
  });

  test('applying action with selector', () => {
    const key1 = createKey(
      'mySlice',
      [],
      {
        char: '1',
      },
      (state) => ({
        s1: { val1_1: state.char },
      }),
    );

    const mySlice1 = slice({
      key: key1,
      actions: {
        moreChar: (num: number) => (state) => {
          return {
            ...state,
            char: Array.from(
              {
                length: num,
              },
              () => state.char,
            ).join(''),
          };
        },
      },
    });

    const mySlice2 = slice({
      key: createKey(
        'mySlice2',
        [mySlice1],
        {
          char: '2',
        },
        (state, storeState) => ({
          s2: {
            val2_1: mySlice1.resolveSelector(storeState).s1,
            val2_2: state.char,
          },
        }),
      ),
      actions: {},
    });

    const mySlice3 = slice({
      key: createKey(
        'mySlice3',
        [mySlice1, mySlice2],
        { char: '3' },
        (state, storeState) => ({
          s3: {
            val3_2: mySlice2.resolveSelector(storeState).s2,
            val3_1: mySlice1.resolveSelector(storeState).s1,
            val3_3: state.char,
          },
        }),
      ),
      actions: {},
    });

    const appState = StoreState.create([mySlice1, mySlice2, mySlice3]);

    const result1 = {
      s3: {
        val3_1: {
          val1_1: '1',
        },
        val3_2: {
          val2_1: {
            val1_1: '1',
          },
          val2_2: '2',
        },
        val3_3: '3',
      },
    };
    expect(mySlice3.resolveSelector(appState)).toEqual(result1);
    expect(mySlice2.resolveSelector(appState).s2).toEqual(
      result1['s3']['val3_2'],
    );
    expect(mySlice1.resolveSelector(appState).s1).toEqual(
      result1['s3']['val3_1'],
    );

    const newAppState = appState.applyTransaction(mySlice1.actions.moreChar(2));

    const result2 = {
      s3: {
        val3_1: {
          val1_1: '11',
        },
        val3_2: {
          val2_1: {
            val1_1: '11',
          },
          val2_2: '2',
        },
        val3_3: '3',
      },
    };

    expect(mySlice3.resolveSelector(newAppState)).toEqual(result2);
    expect(mySlice2.resolveSelector(newAppState).s2).toEqual(
      result2['s3']['val3_2'],
    );
    expect(mySlice1.resolveSelector(newAppState).s1).toEqual(
      result2['s3']['val3_1'],
    );

    // previous state is unaltered
    expect(mySlice3.resolveSelector(appState)).toEqual(result1);
  });
});

describe('Override init state', () => {
  const mySlice1 = slice({
    key: createKey('mySlice1', [], { num1: 0 }),
    actions: {},
  });
  const mySlice2 = slice({
    key: createKey('mySlice2', [], { num2: 0 }),
    actions: {},
  });
  test('can override state', () => {
    const appState = StoreState.create([mySlice1, mySlice2], {
      [mySlice1.lineageId]: { num1: 5 },
    });

    expect(mySlice1.getState(appState).num1).toBe(5);
  });

  test('throws error if slice not found', () => {
    expect(() =>
      StoreState.create([mySlice1, mySlice2], {
        [mySlice1.lineageId]: { num1: 5 },
        [createLineageId('xSlice')]: { num1: 5 },
      }),
    ).toThrowErrorMatchingInlineSnapshot(
      `"Some slice names (l_xSlice$) in initStateOverride were not found in the provided slices"`,
    );
  });
});
