import waitForExpect from 'wait-for-expect';
import { createDispatchSpy, waitUntil } from '../test-helpers';
import { createSlice } from '../vanilla';
import { timeoutSchedular } from '../vanilla/effect';
import { Store } from '../vanilla/store';

describe('Single slice', () => {
  const testSlice = createSlice([], {
    name: 'test',
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
    selector: (state) => state.val.toLocaleUpperCase(),
  }).addEffect({
    name: 'testEffect',
    updateSync(slice, store, prevStoreState) {
      if (!slice.getState(store.state).val.endsWith('Effect')) {
        store.dispatch(
          slice.actions.testAction(slice.getState(store.state).val + 'Effect'),
        );
      }
    },
  });

  test('works', async () => {
    const dispatchSpy = createDispatchSpy();
    const testStore = Store.create({
      storeName: 'test-store',
      state: [testSlice],
      scheduler: timeoutSchedular(0),
      dispatchTx: dispatchSpy.dispatch,
      debug: dispatchSpy.debug,
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

    await waitForExpect(() => {
      expect(dispatchSpy.getSimplifiedTransactions({})).toHaveLength(2);
    });

    expect(dispatchSpy.getSimplifiedTransactions({})).toMatchInlineSnapshot(`
      [
        {
          "actionId": "testAction",
          "dispatchSource": undefined,
          "payload": [
            "banana",
          ],
          "sourceSliceLineage": "l_test$",
          "targetSliceLineage": "l_test$",
        },
        {
          "actionId": "testAction",
          "dispatchSource": "l_test$",
          "payload": [
            "bananaEffect",
          ],
          "sourceSliceLineage": "l_test$",
          "targetSliceLineage": "l_test$",
        },
      ]
    `);

    await waitForExpect(() => {
      expect(dispatchSpy.getDebugLogItems()).toHaveLength(4);
    });

    expect(dispatchSpy.getDebugLogItems()).toMatchInlineSnapshot(`
      [
        {
          "actionId": "testAction",
          "payload": [
            "banana",
          ],
          "sourceSliceLineage": "l_test$",
          "store": "test-store",
          "targetSliceLineage": "l_test$",
          "txId": "<txId>",
          "type": "TX",
        },
        {
          "name": "testEffect",
          "source": [
            {
              "actionId": "testAction",
              "lineageId": "l_test$",
            },
          ],
          "type": "SYNC_UPDATE_EFFECT",
        },
        {
          "actionId": "testAction",
          "dispatcher": "l_test$",
          "payload": [
            "bananaEffect",
          ],
          "sourceSliceLineage": "l_test$",
          "store": "test-store",
          "targetSliceLineage": "l_test$",
          "txId": "<txId>",
          "type": "TX",
        },
        {
          "name": "testEffect",
          "source": [
            {
              "actionId": "testAction",
              "lineageId": "l_test$",
            },
          ],
          "type": "SYNC_UPDATE_EFFECT",
        },
      ]
    `);
  });
});
