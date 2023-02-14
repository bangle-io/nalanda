import { waitUntil } from '../test-heleprs';
import { timeoutSchedular } from '../vanilla/effect';
import { Slice } from '../vanilla/slice';
import { Store } from '../vanilla/store';

describe('Single slice', () => {
  const testSlice = new Slice({
    key: 'test',
    dependencies: [],
    initState: {
      val: 'apple',
    },
    actions: {
      testAction: (val: string) => (state) => {
        return {
          ...state,
          val,
        };
      },
    },
    selectors: {
      testSelector: (state) => state.val.toLocaleUpperCase(),
    },
    effects: [
      {
        name: 'testEffect',
        updateSync(slice, store, prevStoreState) {
          if (!slice.getState(store.state).val.endsWith('Effect')) {
            store.dispatch(
              slice.actions.testAction(
                slice.getState(store.state).val + 'Effect',
              ),
            );
          }
        },
      },
    ],
  });

  test('works', async () => {
    const testStore = Store.create({
      storeName: 'test-store',
      state: [testSlice],
      scheduler: timeoutSchedular(0),
    });

    expect(testSlice.getState(testStore.state)).toEqual({
      val: 'apple',
    });

    testStore.dispatch(testSlice.actions.testAction('banana'));

    expect(testSlice.getState(testStore.state)).toEqual({
      val: 'banana',
    });

    await waitUntil(testStore, (state) =>
      testSlice.getState(state).val.startsWith('bananaEffect'),
    );

    expect(testSlice.getState(testStore.state)).toEqual({
      val: 'bananaEffect',
    });
  });
});
