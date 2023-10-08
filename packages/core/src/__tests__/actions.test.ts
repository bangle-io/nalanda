import {
  expect,
  jest,
  test,
  describe,
  beforeEach,
  afterEach,
} from '@jest/globals';
import { testCleanup } from '../helpers/test-cleanup';
import { createKey } from '../slice/key';
import { createStore } from '../store';
import { IfSubset } from '../types';

afterEach(() => {
  testCleanup();
});

describe('actions', () => {
  const key = createKey('mySliceName', []);

  const counter = key.field(0);
  const counterNegative = key.field(-1);

  const counterSlice = key.slice({
    counter,
    counterNegative,
  });

  function increment() {
    return counter.update((c) => c + 1);
  }

  function decrement() {
    return counterNegative.update((c) => c - 1);
  }

  function customUpdate(val: { counter: number; counterNegative: number }) {
    const txn = key.transaction();

    return txn.step((state) => {
      state = state.apply(counter.update(val.counter));
      state = state.apply(counterNegative.update(val.counterNegative));
      return state;
    });
  }

  function chainedAction() {
    const txn = key.transaction();

    return txn
      .step((state) => {
        state = state.apply(counter.update((c) => c + 1));
        return state;
      })
      .step((state) => {
        return state.apply(counterNegative.update((c) => c - 1));
      })
      .step((state) => {
        return state.apply(counter.update((c) => c + 1));
      });
  }

  function setup() {
    const store = createStore({
      slices: [counterSlice],
    });

    return { store };
  }

  describe('basic actions', () => {
    test('should increment counter', () => {
      const { store } = setup();
      const initStoreState = store.state;

      store.dispatch(increment());

      expect(counterSlice.get(store.state)).toEqual({
        counter: 1,
        counterNegative: -1,
      });

      expect(counterSlice.get(initStoreState)).toEqual({
        counter: 0,
        counterNegative: -1,
      });
    });

    test('should handle multiple increments', () => {
      const { store } = setup();

      store.dispatch(increment());
      store.dispatch(increment());

      const state = store.state;

      expect(counter.get(store.state)).toBe(2);
      expect(counterNegative.get(store.state)).toBe(-1);
    });

    test('should handle increment and decrement', () => {
      const { store } = setup();

      store.dispatch(increment());
      store.dispatch(increment());
      store.dispatch(decrement());

      expect(counter.get(store.state)).toBe(2);
      expect(counterNegative.get(store.state)).toBe(-2);
    });

    test('should maintain state correctness after actions', () => {
      const { store } = setup();

      store.dispatch(increment());
      store.dispatch(increment());
      store.dispatch(decrement());

      expect(counterSlice.get(store.state)).toEqual({
        counter: 2,
        counterNegative: -2,
      });
    });

    test('should update both counter and counterNegative with customUpdate', () => {
      const { store } = setup();

      store.dispatch(customUpdate({ counter: 3, counterNegative: -3 }));

      expect(counterSlice.get(store.state)).toEqual({
        counter: 3,
        counterNegative: -3,
      });
    });

    test('should handle multiple custom updates correctly', () => {
      const { store } = setup();

      store.dispatch(customUpdate({ counter: 2, counterNegative: -2 }));
      store.dispatch(customUpdate({ counter: 5, counterNegative: -5 }));

      expect(counterSlice.get(store.state)).toEqual({
        counter: 5,
        counterNegative: -5,
      });
    });

    test('should maintain correct state after customUpdate and other actions', () => {
      const { store } = setup();

      store.dispatch(customUpdate({ counter: 2, counterNegative: -2 }));
      store.dispatch(increment());
      store.dispatch(decrement());

      expect(counterSlice.get(store.state)).toEqual({
        counter: 3,
        counterNegative: -3,
      });
    });

    test('should double increment the counter', () => {
      const { store } = setup();

      store.dispatch(chainedAction());

      expect(counterSlice.get(store.state)).toEqual({
        counter: 2,
        counterNegative: -2, // Assuming counterNegative remains unaffected
      });
    });
  });

  describe('merging actions from another slice', () => {
    const key = createKey('myOtherSlice', [counterSlice]);

    const base = key.field(0);

    function bumpByNumber(number: number) {
      const txn = key.transaction();

      return txn.step((state) => {
        state = state.apply(
          customUpdate({ counter: number, counterNegative: -number }),
        );
        state = state.apply(base.update((c) => c + number));
        return state;
      });
    }
    const baseSlice = key.slice({
      base,
    });

    test('should work', () => {
      const store = createStore({
        slices: [counterSlice, baseSlice],
      });

      expect(counterSlice.get(store.state)).toEqual({
        counter: 0,
        counterNegative: -1,
      });

      store.dispatch(bumpByNumber(1));

      expect(baseSlice.get(store.state)).toEqual({
        base: 1,
      });

      expect(counterSlice.get(store.state)).toEqual({
        counter: 1,
        counterNegative: -1,
      });
    });
  });
});
