import {
  expect,
  jest,
  test,
  describe,
  beforeEach,
  afterEach,
} from '@jest/globals';
import { createKey, createStore } from '../index';
import { testCleanup } from '../helpers/test-cleanup';

const key = createKey('mySliceName', []);

const counter = key.field(0);
const counterNegative = key.field(-1);

const increment = () => {
  return counter.update((val) => val + 1);
};
const counterSlice = key.slice({ counter, counterNegative, increment });

afterEach(() => {
  testCleanup();
});

test('basic setup', () => {
  const store = createStore({
    autoStartEffects: true,
    slices: [counterSlice],
  });

  expect(counter.get(store.state)).toBe(0);
  expect(counterNegative.get(store.state)).toBe(-1);

  expect(counterSlice.get(store.state)).toEqual({
    counter: 0,
    counterNegative: -1,
  });
});
