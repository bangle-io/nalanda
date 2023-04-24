import { createSlice } from '../../vanilla/create';
import { timeoutSchedular } from '../../vanilla/effect';
import { Store } from '../../vanilla/store';
import { expectType, rejectAny } from '../../vanilla/types';
import { createUseSliceHook } from '../use-slice';

const testSlice1 = createSlice([], {
  initState: {
    num: 4,
  },
  name: 'test-1',
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
    lowercase: () => (state) => {
      return { ...state, name: state.name.toLocaleLowerCase() };
    },
  },
});

test.skip('useSlice with store, types are correct', () => {
  const store = Store.create({
    storeName: 'test-store',
    scheduler: timeoutSchedular(0),
    state: [testSlice1, testSlice2],
  });

  const useSlice = createUseSliceHook(store);

  // @ts-expect-error - should not be able to use a slice that isn't registered
  useSlice(testSlice3);
  let [val] = useSlice(testSlice1);

  rejectAny(val);
  expectType<{ num: number }>(val);

  let [val2] = useSlice(testSlice1);

  rejectAny(val2);
});
