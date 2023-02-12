import { expectType, rejectAny } from '../internal-types';
import { Slice } from '../slice';
import { InternalStoreState } from '../state';

test.todo('slice');

const testSlice0 = new Slice({
  key: 'testSlice0',
  initState: {
    balloons: {
      quantity: 10,
    },
  },
  actions: {},
  selectors: {},
  dependencies: [],
});

const testSlice1 = new Slice({
  key: 'testSlice1',
  initState: {
    a: 1,
  },
  actions: {},
  selectors: {},
  dependencies: [],
});

const testSlice2 = new Slice({
  key: 'testSlice2',
  initState: {
    football: true,
  },
  actions: {
    kick: (now: boolean) => (state) => state,
  },
  selectors: {},
  dependencies: [],
});

const testSlice3 = new Slice({
  key: 'testSlice3',
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
      let t2SliceState = storeState.getSliceState(testSlice2);
      expectType<{ football: boolean }>(t2SliceState);

      //   @ts-expect-error - since not registered
      let t0State = testSlice0.getState(storeState);
      expectType<never>(t0State);
      //   @ts-expect-error - since not registered
      let t0SliceState = storeState.getSliceState(testSlice0);

      expectType<{ name: string }>(state);

      return { ...state, name: prefix + state.name };
    },
    padEnd: (length: number, pad: string) => (state) => {
      return { ...state, name: state.name.padEnd(length, pad) };
    },
    uppercase: () => (state) => {
      return { ...state, name: state.name.toUpperCase() };
    },
  },
  selectors: {},
  dependencies: [testSlice1, testSlice2],
});

const testSlice4 = new Slice({
  key: 'testSlice4',
  initState: {
    basket: 'fine',
  },
  actions: {},
  selectors: {},
  dependencies: [testSlice3],

  effects: [
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
  ],
});

describe('types', () => {
  test('Create slice', () => {
    const mySlice = new Slice({
      key: 'mySlice',
      initState: 0,
      actions: {},
      selectors: {
        majin: (state) => state + 1,
      },
      dependencies: [],
    });

    const storeState = InternalStoreState.create([
      testSlice0,
      testSlice1,
      mySlice,
    ]);

    let result = mySlice.getState(storeState);

    expectType<number>(result);

    let res2 = testSlice1.getState(storeState);
    let res2Reverse = storeState.getSliceState(testSlice1);
    expectType<{ a: number }>(res2);
    expectType<{ a: number }>(res2Reverse);

    // @ts-expect-error - since not registered
    let result2 = testSlice2.getState(storeState);
    // @ts-expect-error - since not registered
    let result2Reverse = storeState.getSliceState(testSlice2);

    let mySliceSelectors = mySlice.resolveSelectors(storeState);
    expectType<number>(mySliceSelectors.majin);

    // @ts-expect-error - since not registered
    let otherSelectors = testSlice2.resolveSelectors(storeState);

    expect(mySlice).toBeDefined();
  });
});
