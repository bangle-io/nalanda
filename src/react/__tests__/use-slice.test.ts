import { createKey, createSlice, slice } from '../../vanilla/create';
import { timeoutSchedular } from '../../vanilla/effect';
import { expectType } from '../../vanilla/internal-types';
import { Store } from '../../vanilla/store';
import { createUseSliceHook } from '../use-slice';

export type IsNeverAny<Type> = true extends false & Type ? never : Type;
export const isNeverAny = <Type>(_: IsNeverAny<Type>) => {};

const testSlice1 = createSlice([], {
  initState: {
    num: 4,
  },
  name: 'test-1',
  selector: () => {},
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
  key: createKey(
    'test-2',
    [],
    { name: 'tame' },

    (state) => ({
      fancy: state.name.padEnd(10, ' ').toUpperCase(),
    }),
  ),
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

const testSlice3 = slice({
  key: createKey('test-3', [], { name: 'tame' }),
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

  isNeverAny(val);
  expectType<{ num: number }>(val);

  let [val2] = useSlice(testSlice1, (state) => state.num + 1);

  isNeverAny(val2);
  expectType<number>(val2);

  let [val3] = useSlice(testSlice2, (state) => {
    expectType<string>(state.fancy);
    return state.name + state.fancy;
  });

  isNeverAny(val3);
  expectType<string>(val3);
});
