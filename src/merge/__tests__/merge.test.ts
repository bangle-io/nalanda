import waitForExpect from 'wait-for-expect';
import { mergeSlices } from '..';
import { createDispatchSpy } from '../../test-helpers';
import { createSlice } from '../../vanilla/create';
import { timeoutSchedular } from '../../vanilla/effect';
import { getActionBuilderByKey } from '../../vanilla/helpers';
import {
  createSliceKey,
  createSliceNameOpaque,
} from '../../vanilla/internal-types';
import { AnySlice } from '../../vanilla/public-types';
import { Slice } from '../../vanilla/slice';
import { Store } from '../../vanilla/store';

function sleep(t = 20): Promise<void> {
  return new Promise((res) => setTimeout(res, t));
}

function findChildSlice(
  parent: AnySlice,
  childSlice: AnySlice,
): AnySlice | undefined {
  if (parent.spec._additionalSlices) {
    return parent.spec._additionalSlices.find(
      (c) => c.lineageId === childSlice.lineageId,
    );
  }
  return;
}

describe('merging', () => {
  test('works', () => {
    const g1 = createSlice([], {
      name: 'g1',
      initState: {},
      actions: {},
      selectors: {},
    });

    const t1 = createSlice([g1], {
      name: 't1',
      initState: {
        f: 4,
      },
      actions: {},
      selectors: {},
    });

    const x0 = mergeSlices({
      name: 'x0',
      children: [t1],
    });

    expect(
      x0.spec._additionalSlices?.map((r) => ({
        key: r.key,
        sDebs: r.spec.dependencies.map((r) => r.key),
      })),
    ).toMatchInlineSnapshot(`
      [
        {
          "key": "key_x0:t1",
          "sDebs": [
            "key_g1",
          ],
        },
      ]
    `);
    const z0 = mergeSlices({
      name: 'z0',
      children: [x0],
    });

    expect(z0.spec.dependencies.map((r) => r.key)).toMatchInlineSnapshot(`[]`);

    expect(
      z0.spec._additionalSlices?.map((r) => ({
        key: r.key,
        sDebs: r.spec.dependencies.map((d) => d.key),
      })),
    ).toMatchInlineSnapshot(`
      [
        {
          "key": "key_z0:x0:t1",
          "sDebs": [
            "key_g1",
          ],
        },
        {
          "key": "key_z0:x0",
          "sDebs": [],
        },
      ]
    `);
  });

  describe('merging', () => {
    const g1 = createSlice([], {
      name: 'g1',
      initState: {
        g1State: 0,
      },
      actions: {
        updateG1State: () => (state) => ({
          ...state,
          g1State: state.g1State + 1,
        }),
      },
      selectors: {},
    });

    const t1 = createSlice([g1], {
      name: 't1',
      initState: {
        t1State: '<unknown>',
        self: 0,
      },
      selectors: {},
      actions: {
        updateT1State: () => (state, storeState) => ({
          ...state,
          self: state.self + 1,
          t1State:
            '(' +
            g1.getState(storeState).g1State.toString() +
            '+' +
            state.t1State +
            ')',
        }),
      },
    }).addEffect({
      name: 't1Effect',
      updateSync(slice, store, prevStoreState) {
        if (
          g1.getState(store.state).g1State === 1 &&
          g1.getState(prevStoreState).g1State === 0
        ) {
          store.dispatch(slice.actions.updateT1State());
        }
      },
    });

    const t2 = createSlice([t1], {
      name: 't2',
      initState: {
        t1State: '<unknown>',
        self: 0,
      },
      actions: {},
      selectors: {
        t2State1: (state, storeState) => {
          return {
            ...state,
            t1State: t1.getState(storeState).t1State,
            self: state.self + 1,
          };
        },
      },
    }).addEffect({
      name: 't2Effect',
      updateSync(slice, store, prevStoreState) {
        if (
          t1.getState(store.state).self === 1 &&
          t1.getState(prevStoreState).self === 0
        ) {
          store.dispatch(t1.actions.updateT1State());
        }
      },
    });

    const t3 = createSlice([g1, t1], {
      name: 't3',
      initState: {
        g1State: '<unknown>',
        t1State: '<unknown>',
        self: 0,
      },
      actions: {
        updateT3State: () => (state, storeState) => ({
          ...state,
          g1State: g1.getState(storeState).g1State + '',
          t1State: t1.getState(storeState).t1State,
          self: state.self + 1,
        }),
      },
      selectors: {},
    }).addEffect({
      name: 't3Effect',
      updateSync(slice, store, prevStoreState) {
        if (
          t1.getState(store.state).self === 2 &&
          slice.getState(store.state).self === 0
        ) {
          store.dispatch(slice.actions.updateT3State());
        }
      },
    });

    const x0 = mergeSlices({
      name: 'x0',
      children: [t1, t2, t3],
    });

    const z0 = mergeSlices({
      name: 'z0',
      children: [x0],
    });

    const getKeys = (slices?: AnySlice[]) => (slices || []).map((s) => s.key);

    test('z0 snapshot', () => {
      expect(getKeys(z0.spec._additionalSlices)).toMatchInlineSnapshot(`
        [
          "key_z0:x0:t1",
          "key_z0:x0:t2",
          "key_z0:x0:t3",
          "key_z0:x0",
        ]
      `);

      expect(
        (z0.spec._additionalSlices || []).map((r) => [
          r.key,
          getKeys(r.spec._additionalSlices),
        ]),
      ).toMatchInlineSnapshot(`
        [
          [
            "key_z0:x0:t1",
            [],
          ],
          [
            "key_z0:x0:t2",
            [],
          ],
          [
            "key_z0:x0:t3",
            [],
          ],
          [
            "key_z0:x0",
            [],
          ],
        ]
      `);
    });

    test.skip('getActionBuilderByKey works on merged slices', () => {
      const store = Store.create({
        storeName: 'test-store',
        state: [g1, z0],
      });

      expect(
        getActionBuilderByKey(
          store,
          createSliceKey('key_z0:x0:t3'),
          'updateT3State',
        ),
      ).toEqual(t3.actions.updateT3State);
    });

    test('static slices are never modified', () => {
      expect(x0.spec.dependencies.map((d) => d.key)).toEqual([]);
      expect(z0.config.originalSpec.dependencies.map((d) => d.key)).toEqual([]);

      expect(x0.spec.dependencies.map((d) => d.key)).toEqual([]);
      expect(x0.config.originalSpec.dependencies.map((d) => d.key)).toEqual([]);
      expect(t3.spec.dependencies.map((d) => d.key)).toEqual([
        'key_g1',
        'key_t1',
      ]);
    });

    test("In Z0 t1 child slice's spec are mapped correctly", () => {
      const mappedT1 = findChildSlice(z0, t1);
      expect(mappedT1?.key).toBe('key_z0:x0:t1');
      expect(mappedT1?.spec.dependencies.map((d) => d.key)).toEqual(['key_g1']);
    });

    test('In Z0 t2 child slice spec are mapped correctly', () => {
      // T2
      const mappedT2 = findChildSlice(z0, t2);
      expect(mappedT2?.key).toBe('key_z0:x0:t2');
      expect(mappedT2?.spec.dependencies.map((d) => d.key)).toEqual([
        'key_z0:x0:t1',
      ]);
      expect(
        mappedT2?.config.originalSpec.dependencies.map((d) => d.key),
      ).toEqual(['key_t1']);
    });

    test('In Z0 t3 child slice spec are mapped correctly', () => {
      // T3
      const mappedT3 = findChildSlice(z0, t3);
      expect(mappedT3?.key).toBe('key_z0:x0:t3');

      expect(mappedT3?.spec.dependencies.map((d) => d.key)).toEqual([
        'key_g1',
        'key_z0:x0:t1',
      ]);
      // original stays intanct
      expect(
        mappedT3?.config.originalSpec.dependencies.map((d) => d.key),
      ).toEqual(['key_g1', 'key_t1']);
    });

    test('state looks okay', () => {
      expect(
        x0.spec._additionalSlices?.map((r) => ({
          key: r.key,
          dependencies: r.spec.dependencies.map((d) => d.key),
        })),
      ).toMatchInlineSnapshot(`
        [
          {
            "dependencies": [
              "key_g1",
            ],
            "key": "key_x0:t1",
          },
          {
            "dependencies": [
              "key_x0:t1",
            ],
            "key": "key_x0:t2",
          },
          {
            "dependencies": [
              "key_g1",
              "key_x0:t1",
            ],
            "key": "key_x0:t3",
          },
        ]
      `);

      expect(
        z0.spec._additionalSlices?.map((r) => ({
          key: r.key,
          sDebs: r.spec.dependencies.map((d) => d.key),
        })),
      ).toMatchInlineSnapshot(`
        [
          {
            "key": "key_z0:x0:t1",
            "sDebs": [
              "key_g1",
            ],
          },
          {
            "key": "key_z0:x0:t2",
            "sDebs": [
              "key_z0:x0:t1",
            ],
          },
          {
            "key": "key_z0:x0:t3",
            "sDebs": [
              "key_g1",
              "key_z0:x0:t1",
            ],
          },
          {
            "key": "key_z0:x0",
            "sDebs": [],
          },
        ]
      `);
    });

    test('state looks okay', async () => {
      let dispatchSpy = createDispatchSpy();
      const store = Store.create({
        scheduler: timeoutSchedular(0),
        dispatchTx: dispatchSpy.dispatch,
        debug: dispatchSpy.debug,
        storeName: 'test-store',
        state: [g1, z0],
      });

      store.dispatch(g1.actions.updateG1State());

      expect((store.state as any).slicesCurrentState).toMatchInlineSnapshot(`
        {
          "key_g1": {
            "g1State": 1,
          },
          "key_z0": {},
          "key_z0:x0": {},
          "key_z0:x0:t1": {
            "self": 0,
            "t1State": "<unknown>",
          },
          "key_z0:x0:t2": {
            "self": 0,
            "t1State": "<unknown>",
          },
          "key_z0:x0:t3": {
            "g1State": "<unknown>",
            "self": 0,
            "t1State": "<unknown>",
          },
        }
      `);

      await waitForExpect(() => {
        expect(
          dispatchSpy
            .getDebugLogItems()
            .find((d) => d.type === 'SYNC_UPDATE_EFFECT'),
        ).toBeDefined();
      });

      expect((store.state as any).slicesCurrentState).toMatchInlineSnapshot(`
        {
          "key_g1": {
            "g1State": 1,
          },
          "key_z0": {},
          "key_z0:x0": {},
          "key_z0:x0:t1": {
            "self": 2,
            "t1State": "(1+(1+<unknown>))",
          },
          "key_z0:x0:t2": {
            "self": 0,
            "t1State": "<unknown>",
          },
          "key_z0:x0:t3": {
            "g1State": "1",
            "self": 1,
            "t1State": "(1+(1+<unknown>))",
          },
        }
      `);

      expect(dispatchSpy.getSimplifiedTransactions({})).toMatchInlineSnapshot(`
        [
          {
            "actionId": "updateG1State",
            "dispatchSource": undefined,
            "payload": [],
            "sourceSliceKey": "key_g1",
            "targetSliceLineage": "l_g1$",
          },
          {
            "actionId": "updateT1State",
            "dispatchSource": "t1Effect",
            "payload": [],
            "sourceSliceKey": "key_t1",
            "targetSliceLineage": "l_t1$",
          },
          {
            "actionId": "updateT1State",
            "dispatchSource": "t2Effect",
            "payload": [],
            "sourceSliceKey": "key_t1",
            "targetSliceLineage": "l_t1$",
          },
          {
            "actionId": "updateT3State",
            "dispatchSource": "t3Effect",
            "payload": [],
            "sourceSliceKey": "key_t3",
            "targetSliceLineage": "l_t3$",
          },
        ]
      `);

      expect(dispatchSpy.getDebugLogItems()).toMatchInlineSnapshot(`
        [
          {
            "actionId": "updateG1State",
            "dispatcher": undefined,
            "payload": [],
            "sourceSliceKey": "key_g1",
            "store": "test-store",
            "txId": "<txId>",
            "type": "TX",
          },
          {
            "name": "t1Effect",
            "source": [
              {
                "actionId": "updateG1State",
                "lineageId": "l_g1$",
              },
            ],
            "type": "SYNC_UPDATE_EFFECT",
          },
          {
            "actionId": "updateT1State",
            "dispatcher": "t1Effect",
            "payload": [],
            "sourceSliceKey": "key_t1",
            "store": "test-store",
            "txId": "<txId>",
            "type": "TX",
          },
          {
            "name": "t2Effect",
            "source": [
              {
                "actionId": "updateG1State",
                "lineageId": "l_g1$",
              },
              {
                "actionId": "updateT1State",
                "lineageId": "l_t1$",
              },
            ],
            "type": "SYNC_UPDATE_EFFECT",
          },
          {
            "actionId": "updateT1State",
            "dispatcher": "t2Effect",
            "payload": [],
            "sourceSliceKey": "key_t1",
            "store": "test-store",
            "txId": "<txId>",
            "type": "TX",
          },
          {
            "name": "t3Effect",
            "source": [
              {
                "actionId": "updateG1State",
                "lineageId": "l_g1$",
              },
              {
                "actionId": "updateT1State",
                "lineageId": "l_t1$",
              },
              {
                "actionId": "updateT1State",
                "lineageId": "l_t1$",
              },
            ],
            "type": "SYNC_UPDATE_EFFECT",
          },
          {
            "actionId": "updateT3State",
            "dispatcher": "t3Effect",
            "payload": [],
            "sourceSliceKey": "key_t3",
            "store": "test-store",
            "txId": "<txId>",
            "type": "TX",
          },
          {
            "name": "t1Effect",
            "source": [
              {
                "actionId": "updateT1State",
                "lineageId": "l_t1$",
              },
              {
                "actionId": "updateT1State",
                "lineageId": "l_t1$",
              },
            ],
            "type": "SYNC_UPDATE_EFFECT",
          },
          {
            "name": "t2Effect",
            "source": [
              {
                "actionId": "updateT1State",
                "lineageId": "l_t1$",
              },
            ],
            "type": "SYNC_UPDATE_EFFECT",
          },
          {
            "name": "t3Effect",
            "source": [
              {
                "actionId": "updateT3State",
                "lineageId": "l_t3$",
              },
            ],
            "type": "SYNC_UPDATE_EFFECT",
          },
        ]
      `);
    });
  });
});
