import { testOverrideSlice } from '../../test-helpers';
import { createKey, slice } from '../create';
import { createSliceKey, expectType } from '../internal-types';
import { InternalStoreState } from '../state';
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

    const state = InternalStoreState.create([mySlice]);

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

    expect(newState.getSliceState(mySlice)).toEqual({
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

    const state = InternalStoreState.create([sliceDep1, sliceDep2, mySlice]);

    const newState = state.applyTransaction(mySlice.actions.myAction(5));

    const result = newState.getSliceState(mySlice);

    // @ts-expect-error - should error when a field is not defined
    let testVal0 = result.xyz;

    expectType<{ num: number } | undefined>(result);

    expect(newState.getSliceState(mySlice)).toEqual({
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
      InternalStoreState.create([mySlice, mySlice2]);
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
      InternalStoreState.create([mySlice]);
    }).toThrowErrorMatchingInlineSnapshot(
      `"Slice "key_test" has a dependency on Slice "key_test-dep" which is either not registered or is registered after this slice."`,
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
      InternalStoreState.create([mySlice, sliceDep]);
    }).toThrowErrorMatchingInlineSnapshot(
      `"Slice "key_test" has a dependency on Slice "key_test-dep" which is either not registered or is registered after this slice."`,
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

    let newState1 = InternalStoreState.create([
      slice1,
      testOverrideSlice(slice2, { initState: { num: 99 } }),
    ]);

    expect(newState1.getSliceState(slice1)).toEqual({ num: 1 });
    expect(newState1.getSliceState(slice2)).toEqual({ num: 99 });

    let newState2 = InternalStoreState.create([
      testOverrideSlice(slice1, { initState: { num: -1 } }),
      slice2,
    ]);
    expect(newState2.getSliceState(slice1)).toEqual({ num: -1 });
    expect(newState1.getSliceState(slice1)).toEqual({ num: 1 });
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
    });

    expect(
      testOverrideSlice(slice1, { effects: [] }).spec.effects,
    ).toHaveLength(0);
    // should not affect initial slice
    expect(slice1.spec.effects).toHaveLength(1);
  });

  test('overriding dependencies', () => {
    const slice1 = slice({
      key: createKey('test1', [], { num: 1 }),
      actions: {},
    });

    expect(
      testOverrideSlice(slice1, { dependencies: [testSlice1] }).spec
        .dependencies.length,
    ).toBe(1);

    expect(slice1.spec.dependencies.length).toBe(0);
  });
});

describe('State creation', () => {
  test('empty slices', () => {
    const appState = InternalStoreState.create([]);

    expect(appState).toMatchInlineSnapshot(
      {
        _slices: expect.any(Array),
        slicesCurrentState: expect.any(Object),
        sliceLookupByKey: expect.any(Object),
      } as any,
      `
      {
        "_slices": Any<Array>,
        "context": undefined,
        "opts": undefined,
        "sliceLookupByKey": Any<Object>,
        "slicesCurrentState": Any<Object>,
      }
    `,
    );
  });

  test('with a slice', () => {
    const mySlice = slice({
      key: createKey('mySlice', [], { val: null }),
      actions: {},
    });

    const appState = InternalStoreState.create([mySlice]);

    expect(appState.getSliceState(mySlice)).toEqual({ val: null });
    expect(appState).toEqual({
      _slices: expect.any(Array),
      opts: undefined,
      sliceLookupByKey: expect.any(Object),
      slicesCurrentState: {
        key_mySlice: {
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

    const appState = InternalStoreState.create([mySlice]);

    expect(() =>
      appState.applyTransaction(
        new Transaction({
          sourceSliceName: 'mySlice',
          sourceSliceKey: createSliceKey('mySlice'),
          payload: [5],
          actionId: 'updateNum',
        }),
      ),
    ).toThrowError(`Action "updateNum" not found in Slice "key_mySlice"`);
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

    const appState = InternalStoreState.create([mySlice, mySlice2]);
    expect(mySlice.getState(appState).num).toBe(0);

    let newAppState = appState.applyTransaction(mySlice2.actions.updateNum(4));
    expect(mySlice.getState(newAppState).num).toBe(0);
    expect(mySlice2.getState(newAppState).num).toBe(4);
  });

  test('applying action with selectors', () => {
    const key1 = createKey(
      'mySlice',
      [],
      {
        char: '1',
      },
      {
        s1: (state) => {
          return {
            val1_1: state.char,
          };
        },
      },
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
        {
          s2: (state, storeState) => {
            return {
              val2_1: mySlice1.resolveSelectors(storeState).s1,
              val2_2: state.char,
            };
          },
        },
      ),
      actions: {},
    });

    const mySlice3 = slice({
      key: createKey(
        'mySlice3',
        [mySlice1, mySlice2],
        { char: '3' },
        {
          s3: (state, storeState) => {
            return {
              val3_2: mySlice2.resolveSelectors(storeState).s2,
              val3_1: mySlice1.resolveSelectors(storeState).s1,
              val3_3: state.char,
            };
          },
        },
      ),
      actions: {},
    });

    const appState = InternalStoreState.create([mySlice1, mySlice2, mySlice3]);

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
    expect(mySlice3.resolveSelectors(appState)).toEqual(result1);
    expect(mySlice2.resolveSelectors(appState).s2).toEqual(
      result1['s3']['val3_2'],
    );
    expect(mySlice1.resolveSelectors(appState).s1).toEqual(
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

    expect(mySlice3.resolveSelectors(newAppState)).toEqual(result2);
    expect(mySlice2.resolveSelectors(newAppState).s2).toEqual(
      result2['s3']['val3_2'],
    );
    expect(mySlice1.resolveSelectors(newAppState).s1).toEqual(
      result2['s3']['val3_1'],
    );

    // previous state is unaltered
    expect(mySlice3.resolveSelectors(appState)).toEqual(result1);
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
    const appState = InternalStoreState.create([mySlice1, mySlice2], {
      mySlice1: { num1: 5 },
    });

    expect(mySlice1.getState(appState).num1).toBe(5);
  });

  test('throws error if slice not found', () => {
    expect(() =>
      InternalStoreState.create([mySlice1, mySlice2], {
        mySlice1: { num1: 5 },
        xSlice: { num1: 5 },
      }),
    ).toThrowErrorMatchingInlineSnapshot(
      `"Some slice names (xSlice) in initStateOverride were not found in the provided slices"`,
    );
  });
});
