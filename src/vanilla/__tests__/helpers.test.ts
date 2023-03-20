import { createSlice } from '../create';
import { getActionBuilderByKey, getSliceByKey } from '../helpers';
import { Store } from '../store';

const testSlice1InitState = {
  num: 0,
};
const testSlice1Decrement =
  (opts: { decrement: boolean }) => (state: typeof testSlice1InitState) => {
    return { ...state, num: state.num - (opts.decrement ? 1 : 0) };
  };
const testSlice1 = createSlice([], {
  name: 'test-1',
  selectors: {},
  initState: testSlice1InitState,
  actions: {
    increment: (opts: { increment: boolean }) => (state) => {
      return { ...state, num: state.num + (opts.increment ? 1 : 0) };
    },
    decrement: testSlice1Decrement,
  },
});

describe('getSliceByKey', () => {
  const store = Store.create({
    storeName: 'test-store',
    state: [testSlice1],
  });

  test('works', () => {
    expect(getSliceByKey(store, testSlice1.key)).toEqual(testSlice1);
  });
});

describe('getActionBuilderByKey', () => {
  const store = Store.create({
    storeName: 'test-store',
    state: [testSlice1],
  });

  test('works', () => {
    expect(getActionBuilderByKey(store, testSlice1.key, 'decrement')).toBe(
      testSlice1Decrement,
    );
  });
});
