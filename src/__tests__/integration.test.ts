import waitForExpect from 'wait-for-expect';
import { createDispatchSpy, waitUntil } from '../test-helpers';
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
          "sliceKey": "test",
        },
        {
          "actionId": "ready",
          "dispatchSource": undefined,
          "payload": [],
          "sliceKey": "$nalanda/CORE_SLICE_READY",
        },
        {
          "actionId": "testAction",
          "dispatchSource": "testEffect",
          "payload": [
            "bananaEffect",
          ],
          "sliceKey": "test",
        },
      ]
    `);

    expect(dispatchSpy.getDebugLogItems()).toMatchInlineSnapshot(`
      [
        {
          "actionId": "testAction",
          "dispatcher": undefined,
          "payload": [
            "banana",
          ],
          "slice": "test",
          "store": "test-store",
          "txId": "<txId>",
          "type": "TX",
        },
        {
          "actionId": "ready",
          "dispatcher": undefined,
          "payload": [],
          "slice": "$nalanda/CORE_SLICE_READY",
          "store": "test-store",
          "txId": "<txId>",
          "type": "TX",
        },
        {
          "name": "testEffect",
          "source": [
            {
              "actionId": "testAction",
              "sliceKey": "test",
            },
          ],
          "type": "SYNC_UPDATE_EFFECT",
        },
        {
          "actionId": "testAction",
          "dispatcher": "testEffect",
          "payload": [
            "bananaEffect",
          ],
          "slice": "test",
          "store": "test-store",
          "txId": "<txId>",
          "type": "TX",
        },
        {
          "name": "<unknownEffect>",
          "source": [
            {
              "actionId": "ready",
              "sliceKey": "$nalanda/CORE_SLICE_READY",
            },
          ],
          "type": "SYNC_UPDATE_EFFECT",
        },
        {
          "name": "testEffect",
          "source": [
            {
              "actionId": "testAction",
              "sliceKey": "test",
            },
          ],
          "type": "SYNC_UPDATE_EFFECT",
        },
        {
          "name": "testEffect",
          "source": [
            {
              "actionId": "testAction",
              "sliceKey": "test",
            },
            {
              "actionId": "testAction",
              "sliceKey": "test",
            },
          ],
          "type": "UPDATE_EFFECT",
        },
        {
          "name": "<unknownEffect>",
          "source": [
            {
              "actionId": "ready",
              "sliceKey": "$nalanda/CORE_SLICE_READY",
            },
          ],
          "type": "UPDATE_EFFECT",
        },
      ]
    `);
  });
});
