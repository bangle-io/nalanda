import { createSlice } from '../create';
import { expectType, rejectAny } from '../internal-types';
import { Slice } from '../slice';
import { StoreState } from '../state';

const testSlice0 = new Slice({
  name: 'testSlice0',
  initState: {
    balloons: {
      quantity: 10,
    },
  },
  actions: {},
  selector: () => {},
  dependencies: [],
  reducer: (state) => state,
});

const testSlice1 = new Slice({
  name: 'testSlice1',
  initState: {
    a: 1,
  },
  actions: {},
  selector: () => {},
  dependencies: [],
  reducer: (state) => state,
});

const testSlice2 = createSlice([], {
  name: 'testSlice2',
  initState: {
    football: true,
  },
  actions: {
    kick: (now: boolean) => (state) => state,
  },
  selector: () => {},
});

const testSlice3 = createSlice([testSlice1, testSlice2], {
  name: 'testSlice3',
  initState: {
    name: 'raja',
  },
  actions: {
    prefix: (prefix: string) => (state, storeState) => {
      rejectAny(state);

      let t1State = testSlice1.getState(storeState);
      expectType<{ a: number }>(t1State);

      let t2State = testSlice2.getState(storeState);
      expectType<{ football: boolean }>(t2State);

      //   @ts-expect-error - since not registered
      let t0State = testSlice0.getState(storeState);
      expectType<never>(t0State);

      return { ...state, name: prefix + state.name };
    },
    padEnd: (length: number, pad: string) => (state) => {
      return { ...state, name: state.name.padEnd(length, pad) };
    },
    uppercase: () => (state) => {
      return { ...state, name: state.name.toUpperCase() };
    },
  },
  selector: () => {},
});

const testSlice4 = createSlice([testSlice3], {
  name: 'testSlice4',
  initState: {
    basket: 'fine',
  },
  actions: {},
  selector: () => {},
}).addEffect([
  {
    name: 'testEffect1',
    update: (slice, store, prevStoreState) => {
      let state = slice.getState(store.state);
      let prevState = slice.getState(prevStoreState);

      store.dispatch(testSlice3.actions.prefix('Mr. '));
      // @ts-expect-error - since not registered
      store.dispatch(testSlice2.actions.kick(true));

      expectType<{ basket: string }>(state);
      expectType<{ basket: string }>(prevState);
    },
  },

  {
    name: 'testEffect2',
    update: (slice, store, prevStoreState) => {
      let state = slice.getState(store.state);
      let prevState = slice.getState(prevStoreState);

      // @ts-expect-error - since not registered
      let t0State = testSlice0.getState(store.state);
      // @ts-expect-error - since not registered
      let t0StatePrev = testSlice0.getState(prevStoreState);
      expectType<never>(t0State);

      expectType<{ basket: string }>(state);
      expectType<{ basket: string }>(prevState);
    },
  },
]);

describe('types', () => {
  test('Create slice', () => {
    const mySlice = createSlice([], {
      name: 'mySlice',
      initState: {
        val: 0,
      },
      actions: {},
      selector: (state) => ({
        majin: state.val + 1,
      }),
    });
    const storeState = StoreState.create([testSlice0, testSlice1, mySlice]);

    let result = mySlice.getState(storeState);

    expectType<number>(result.val);

    let res2 = testSlice1.getState(storeState);
    expectType<{ a: number }>(res2);

    expect(() => {
      // @ts-expect-error - since not registered
      let result2 = testSlice2.getState(storeState);
    }).toThrowErrorMatchingInlineSnapshot(
      `"Slice "testSlice2" not found in store"`,
    );

    expect(() => {
      let result2Reverse = StoreState.getSliceState(storeState, testSlice2);
    }).toThrowErrorMatchingInlineSnapshot(
      `"Slice "testSlice2" not found in store"`,
    );

    let mySliceSelectors = mySlice.resolveSelector(storeState);
    expectType<number>(mySliceSelectors.majin);

    expect(() => {
      // @ts-expect-error - since not registered
      testSlice2.resolveSelector(storeState);
    }).toThrowErrorMatchingInlineSnapshot(
      `"Slice "testSlice2" not found in store"`,
    );

    expect(mySlice).toBeDefined();
  });
});
