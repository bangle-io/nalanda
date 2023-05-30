import waitForExpect from 'wait-for-expect';
import { syncChangeEffect } from '../effects';
import { createDispatchSpy, waitUntil } from '../test-helpers/test-helpers';
import { createSelector, createSliceWithSelectors, Slice } from '../vanilla';
import { timeoutSchedular } from '../vanilla/effect';
import { Store } from '../vanilla/store';

describe('Single slice', () => {
  const testSlice = createSliceWithSelectors([], {
    name: 'test',
    initState: {
      val: 'apple',
    },
    selectors: {
      computedVal: createSelector({ val: (state) => state.val }, (state) =>
        state.val.toLocaleUpperCase(),
      ),
    },
  });

  const testAction = Slice.createAction(
    testSlice,
    'testAction',
    (val: string) => {
      return (state) => ({
        ...state,
        val,
      });
    },
  );

  Slice.registerEffectSlice(testSlice, [
    syncChangeEffect(
      'testEffect',
      {
        val: testSlice.pick((state) => state.val),
      },
      ({ val }, dispatch) => {
        if (!val.endsWith('Effect')) {
          dispatch(testAction(val + 'Effect'));
        }
      },
    ),
  ]);

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

    testStore.dispatch(testAction('banana'));

    expect(testSlice.getState(testStore.state)).toEqual({
      val: 'banana',
    });

    await waitUntil(testStore, (state) =>
      testSlice.getState(state).val.startsWith('bananaEffect'),
    );

    expect(testSlice.resolveState(testStore.state)).toEqual({
      val: 'bananaEffect',
      computedVal: 'BANANAEFFECT',
    });

    await waitForExpect(() => {
      expect(dispatchSpy.getSimplifiedTransactions()).toHaveLength(3);
    });

    expect(dispatchSpy.getSimplifiedTransactions()).toMatchInlineSnapshot(`
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
          "actionId": "ready",
          "dispatchSource": "l_testEffect$",
          "payload": [],
          "sourceSliceLineage": "l_testEffect$",
          "targetSliceLineage": "l_testEffect$",
        },
        {
          "actionId": "testAction",
          "dispatchSource": "l_testEffect$",
          "payload": [
            "bananaEffect",
          ],
          "sourceSliceLineage": "l_test$",
          "targetSliceLineage": "l_test$",
        },
      ]
    `);

    await waitForExpect(() => {
      expect(dispatchSpy.getDebugLogItems()).toHaveLength(5);
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
          "actionId": "ready",
          "dispatcher": "l_testEffect$",
          "payload": [],
          "sourceSliceLineage": "l_testEffect$",
          "store": "test-store",
          "targetSliceLineage": "l_testEffect$",
          "txId": "<txId>",
          "type": "TX",
        },
        {
          "name": "testEffect(changeEffect)",
          "source": [],
          "type": "CUSTOM_EFFECT",
        },
        {
          "actionId": "testAction",
          "dispatcher": "l_testEffect$",
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
          "name": "testEffect(changeEffect)",
          "source": [],
          "type": "CUSTOM_EFFECT",
        },
      ]
    `);
  });
});
