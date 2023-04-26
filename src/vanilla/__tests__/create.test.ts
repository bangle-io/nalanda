import {
  createSlice,
  createSliceWithSelectors,
  createSelector,
} from '../create';
import { Slice } from '../slice';
import { StoreState } from '../state';
import { expectType, rejectAny } from '../types';

const baseSlice1 = createSlice([], {
  name: 'base-1',
  initState: {
    num: 4,
  },
  actions: {
    increment: (opts: { increment: boolean }) => (state) => {
      return { ...state, num: state.num + (opts.increment ? 1 : 0) };
    },
    decrement: (opts: { decrement: boolean }) => (state, sl) => {
      return { ...state, num: state.num - (opts.decrement ? 1 : 0) };
    },
  },
});

const baseSlice2 = createSlice([], {
  name: 'base-2',
  initState: {
    num: 4,
  },
  actions: {},
});
const baseSlice3 = createSlice([], {
  name: 'base-3',
  initState: {},
  actions: {},
});

describe('applyTransaction', () => {
  test('applyTransaction works', () => {
    const mySlice = createSlice([baseSlice1], {
      name: 'test-1',
      initState: {
        num: 1,
      },
      actions: {
        myAction: (num: number) => (state) => {
          return { ...state, num: num + state.num };
        },
        action2: (num: number, foo: string, brother: () => void) => (state) =>
          state,
      },
    });

    const mySlice2 = createSlice([mySlice, baseSlice1], {
      name: 'test-2',
      initState: {
        num: 1,
      },
      actions: {
        myAction: (num: number) => (state) => {
          return { ...state, num: num + state.num };
        },
        action2: (num: number, foo: string, brother: () => void) => (state) =>
          state,
      },
    });

    const state = StoreState.create([baseSlice1, mySlice, mySlice2]);

    expectType<number>(mySlice.getState(state).num);

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
  });
});

describe('createSliceWithSelectors', () => {
  test('works', () => {
    const testSlice1 = createSliceWithSelectors([baseSlice1, baseSlice2], {
      name: 'test-1',
      initState: {
        num: 1,
        bar: 'world',
      },
      selectors: {
        sel0: createSelector(
          {
            nu: (f, storeState) => {
              rejectAny(f);
              rejectAny(storeState);
              expectType<StoreState<'base-1' | 'base-2'>>(storeState);
              expectType<number>(f.num);
              () => {
                // @ts-expect-error - should error as baseSlice3 is not registered
                baseSlice3.getDerivedState(storeState);
              };
              return Boolean(f.num);
            },
            ba: (f) => {
              expectType<string>(f.bar);
              return f.bar;
            },
          },
          ({ nu, ba }, storeState) => {
            let s1 = baseSlice1.getState(storeState);
            let s2 = baseSlice2.getState(storeState);

            expectType<number>(s1.num);
            let res1 = baseSlice1.getDerivedState(storeState);
            let res2 = baseSlice2.getDerivedState(storeState);
            () => {
              // @ts-expect-error - should error as baseSlice3 is not registered
              baseSlice3.getDerivedState(storeState);

              // @ts-expect-error - should error as testSlice1 is self-referencing
              testSlice1.getDerivedState(storeState);
            };
            return false;
          },
        ),
        sel1: (initStoreState, slice) => {
          rejectAny(initStoreState);
          rejectAny(slice);
          expectType<StoreState<'base-1' | 'base-2' | 'test-1'>>(
            initStoreState,
          );

          // if using custom selectors, allow calling
          // self
          () => {
            slice.getState(initStoreState);

            // to avoid infinite loops, we return a never
            let resolved = slice.resolveState(initStoreState);
            rejectAny(resolved);
            expectType<never>(resolved);
            let derived = slice.getDerivedState(initStoreState);
            rejectAny(derived);
            expectType<never>(derived);
          };

          expectType<
            Omit<
              Slice<
                'test-1',
                {
                  num: number;
                  bar: string;
                },
                'base-1' | 'base-2',
                any
              >,
              'resolveState' | 'getDerivedState'
            >
          >(slice);

          return (storeState) => {
            rejectAny(storeState);
            expectType<StoreState<'base-1' | 'base-2'>>(storeState);

            () => {
              slice.getState(storeState);
              let resolved = slice.resolveState(storeState);
              rejectAny(resolved);
              expectType<never>(resolved);
            };

            return 9;
          };
        },

        sel2: (initStoreState, slice) => {
          return (storeState) => {
            return '';
          };
        },
      },
      terminal: false,
    });

    rejectAny(testSlice1);

    expectType<
      Slice<
        'test-1',
        {
          num: number;
          bar: string;
        },
        'base-1' | 'base-2',
        {
          sel0: boolean;
          sel1: number;
          sel2: string;
        }
      >
    >(testSlice1);
  });
});
