import { createKey, createStore } from '../../index';

test('basic setup', () => {
  const key = createKey('mySliceName');

  const counter = key.state(0);
  const counterNegative = key.state(-1);

  const counterSlice = key.slice({
    counter,
    counterNegative,
  });

  const store = createStore({
    slices: [counterSlice],
  });

  expect(counter.get(store.state)).toBe(0);
  expect(counterNegative.get(store.state)).toBe(-1);

  expect(counterSlice.get(store.state)).toEqual({
    counter: 0,
    counterNegative: -1,
  });
});
