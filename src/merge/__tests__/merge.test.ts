import {
  createSelector,
  createSlice,
  createSliceWithSelectors,
  Slice,
  Store,
  StoreState,
} from '../../vanilla';
import { expectType, rejectAny } from '../../vanilla/types';
import { mergeAll } from '../merge';

const testSlice1 = createSliceWithSelectors([], {
  initState: {
    num: 0,
  },
  name: 'test-1',
  selectors: {
    doubleNumSelector: createSelector(
      {
        num: (state) => state.num,
      },
      ({ num }) => num * 2,
    ),
  },
});

const testSlice1Increment = Slice.createAction(
  testSlice1,
  'increment',
  (opts: { increment: boolean }) => {
    return (state) => {
      return {
        ...state,
        num: state.num + (opts.increment ? 1 : 0),
      };
    };
  },
);

const testSlice1Decrement = Slice.createAction(
  testSlice1,
  'decrement',
  (opts: { decrement: boolean }) => {
    return (state) => {
      return {
        ...state,
        num: state.num - (opts.decrement ? 1 : 0),
      };
    };
  },
);

const testSlice2 = createSlice([], {
  name: 'test-2',
  initState: {
    name2: 'tame',
  },
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

const testSlice3 = createSlice([testSlice2, testSlice1], {
  name: 'test-3',
  initState: {
    name3: 'TAME',
  },
  actions: {
    lowercase: () => (state) => {
      return { ...state, name3: state.name3.toLocaleLowerCase() };
    },
    mergeWith2: () => (state, storeState) => {
      return {
        ...state,
        name3: state.name3 + testSlice2.getState(storeState).name2,
      };
    },

    mergeWith1: () => (state, storeState) => {
      return {
        ...state,
        name3:
          state.name3 + testSlice1.resolveState(storeState).doubleNumSelector,
      };
    },
  },
});

test('updates the state', () => {
  const forwarded = mergeAll([testSlice1, testSlice2, testSlice3], {
    name: 'test-1-merged',
  });

  const store = Store.create({
    storeName: 'test-store',
    state: StoreState.create([forwarded]),
  });
  let result = forwarded.resolveState(store.state);
  rejectAny(result);
  expectType<{
    doubleNumSelector: number;
    name2: string;
    name3: string;
    num: number;
  }>(result);

  expect(forwarded.resolveState(store.state)).toMatchInlineSnapshot(`
      {
        "doubleNumSelector": 0,
        "name2": "tame",
        "name3": "TAME",
        "num": 0,
      }
    `);

  (store as Store<any>).dispatch(testSlice1Increment({ increment: true }));
  (store as Store<any>).dispatch(testSlice1Increment({ increment: true }));

  expect(forwarded.resolveState(store.state)).toMatchInlineSnapshot(`
      {
        "doubleNumSelector": 4,
        "name2": "tame",
        "name3": "TAME",
        "num": 2,
      }
    `);

  // TODO we are yet to implement action support
  (store as Store<any>).dispatch(testSlice3.actions.mergeWith2());

  expect(forwarded.resolveState(store.state)).toMatchInlineSnapshot(`
      {
        "doubleNumSelector": 4,
        "name2": "tame",
        "name3": "TAMEtame",
        "num": 2,
      }
    `);

  (store as Store<any>).dispatch(testSlice1Decrement({ decrement: true }));
  (store as Store<any>).dispatch(testSlice3.actions.mergeWith1());

  expect(forwarded.resolveState(store.state)).toMatchInlineSnapshot(`
      {
        "doubleNumSelector": 2,
        "name2": "tame",
        "name3": "TAMEtame2",
        "num": 1,
      }
    `);
});
