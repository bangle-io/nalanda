import { createKey } from '../slice/key';
import { createStore } from '../store';

describe('internal fields', () => {
  test('internal field should be updated', () => {
    const key = createKey('mySliceName');

    const counter = key.field(0);

    const counterSlice = key.slice({
      fields: {},
    });

    function updateCounter(state: number) {
      return counter.update(state + 1);
    }

    const store = createStore({
      slices: [counterSlice],
    });

    expect(counter.get(store.state)).toBe(0);
  });
});
