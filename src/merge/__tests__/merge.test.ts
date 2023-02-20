import waitForExpect from 'wait-for-expect';
import { mergeSlices } from '..';
import { createDispatchSpy, waitUntil } from '../../test-helpers';
import { coreReadySlice } from '../../vanilla';
import { CORE_SLICE_READY } from '../../vanilla/core-effects';
import { createSlice } from '../../vanilla/create';
import { timeoutSchedular } from '../../vanilla/effect';
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
      key: 'g1',
      initState: {},
      actions: {},
      selectors: {},
    });

    const t1 = createSlice([g1], {
      key: 't1',
      initState: {
        f: 4,
      },
      actions: {},
      selectors: {},
    });

    const x0 = mergeSlices({
      key: 'x0',
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
          "key": "x0:t1",
          "sDebs": [
            "g1",
          ],
        },
      ]
    `);
    const z0 = mergeSlices({
      key: 'z0',
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
          "key": "z0:x0:t1",
          "sDebs": [
            "g1",
          ],
        },
        {
          "key": "z0:x0",
          "sDebs": [],
        },
      ]
    `);
  });

  describe('merging', () => {
    const g1 = createSlice([], {
      key: 'g1',
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

    const t1 = new Slice({
      key: 't1',
      initState: {
        t1State: '<unknown>',
        self: 0,
      },
      selectors: {},
      dependencies: [g1],
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
      effects: [
        {
          name: 't1Effect',
          updateSync(slice, store, prevStoreState) {
            if (
              g1.getState(store.state).g1State === 1 &&
              g1.getState(prevStoreState).g1State === 0
            ) {
              store.dispatch(slice.actions.updateT1State());
            }
          },
        },
      ],
    });

    const t2 = new Slice({
      key: 't2',
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
      dependencies: [t1],
      effects: [
        {
          name: 't2Effect',
          updateSync(slice, store, prevStoreState) {
            if (
              t1.getState(store.state).self === 1 &&
              t1.getState(prevStoreState).self === 0
            ) {
              store.dispatch(t1.actions.updateT1State());
            }
          },
        },
      ],
    });

    const t3 = new Slice({
      dependencies: [g1, t1],
      key: 't3',
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
      effects: [
        {
          name: 't3Effect',
          updateSync(slice, store, prevStoreState) {
            if (
              t1.getState(store.state).self === 2 &&
              slice.getState(store.state).self === 0
            ) {
              store.dispatch(slice.actions.updateT3State());
            }
          },
        },
      ],
    });

    const x0 = mergeSlices({
      key: 'x0',
      children: [t1, t2, t3],
    });

    const z0 = mergeSlices({
      key: 'z0',
      children: [x0],
    });

    const getKeys = (slices?: AnySlice[]) => (slices || []).map((s) => s.key);

    test('z0 snapshot', () => {
      expect(getKeys(z0.spec._additionalSlices)).toMatchInlineSnapshot(`
        [
          "z0:x0:t1",
          "z0:x0:t2",
          "z0:x0:t3",
          "z0:x0",
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
            "z0:x0:t1",
            [],
          ],
          [
            "z0:x0:t2",
            [],
          ],
          [
            "z0:x0:t3",
            [],
          ],
          [
            "z0:x0",
            [],
          ],
        ]
      `);
    });

    test('static slices are never modified', () => {
      expect(x0.spec.dependencies.map((d) => d.key)).toEqual([]);
      expect(z0.config.originalSpec.dependencies.map((d) => d.key)).toEqual([]);

      expect(x0.spec.dependencies.map((d) => d.key)).toEqual([]);
      expect(x0.config.originalSpec.dependencies.map((d) => d.key)).toEqual([]);
      expect(t3.spec.dependencies.map((d) => d.key)).toEqual(['g1', 't1']);
    });

    test("In Z0 t1 child slice's spec are mapped correctly", () => {
      const mappedT1 = findChildSlice(z0, t1);
      expect(mappedT1?.key).toBe('z0:x0:t1');
      expect(mappedT1?.spec.dependencies.map((d) => d.key)).toEqual(['g1']);
    });

    test('In Z0 t2 child slice spec are mapped correctly', () => {
      // T2
      const mappedT2 = findChildSlice(z0, t2);
      expect(mappedT2?.key).toBe('z0:x0:t2');
      expect(mappedT2?.spec.dependencies.map((d) => d.key)).toEqual([
        'z0:x0:t1',
      ]);
      expect(
        mappedT2?.config.originalSpec.dependencies.map((d) => d.key),
      ).toEqual(['t1']);
      expect(mappedT2?.keyMap.resolve('t1')).toBe('z0:x0:t1');
    });

    test('In Z0 t3 child slice spec are mapped correctly', () => {
      // T3
      const mappedT3 = findChildSlice(z0, t3);
      expect(mappedT3?.key).toBe('z0:x0:t3');

      expect(mappedT3?.spec.dependencies.map((d) => d.key)).toEqual([
        'g1',
        'z0:x0:t1',
      ]);
      // original stays intanct
      expect(
        mappedT3?.config.originalSpec.dependencies.map((d) => d.key),
      ).toEqual(['g1', 't1']);

      expect(mappedT3?.keyMap.resolve('t1')).toBe('z0:x0:t1');
      expect(mappedT3?.keyMap.resolve('t3')).toBe('z0:x0:t3');
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
              "g1",
            ],
            "key": "x0:t1",
          },
          {
            "dependencies": [
              "x0:t1",
            ],
            "key": "x0:t2",
          },
          {
            "dependencies": [
              "g1",
              "x0:t1",
            ],
            "key": "x0:t3",
          },
        ]
      `);

      let result: any[] = [];

      [...(z0.spec._additionalSlices || []), z0]?.map((r) => {
        let miniResult: string[] = [];
        for (const sl of [g1, t1, t2, t3, x0, z0]) {
          miniResult.push([sl.key, r.keyMap.resolve?.(sl.key)].join('>'));
        }
        result.push([r.key, miniResult.join(', ')]);
      });

      expect(result).toMatchInlineSnapshot(`
        [
          [
            "z0:x0:t1",
            "g1>g1, t1>z0:x0:t1, t2>t2, t3>t3, x0>x0, z0>z0",
          ],
          [
            "z0:x0:t2",
            "g1>g1, t1>z0:x0:t1, t2>z0:x0:t2, t3>t3, x0>x0, z0>z0",
          ],
          [
            "z0:x0:t3",
            "g1>g1, t1>z0:x0:t1, t2>t2, t3>z0:x0:t3, x0>x0, z0>z0",
          ],
          [
            "z0:x0",
            "g1>g1, t1>t1, t2>t2, t3>t3, x0>z0:x0, z0>z0",
          ],
          [
            "z0",
            "g1>g1, t1>t1, t2>t2, t3>t3, x0>x0, z0>z0",
          ],
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
            "key": "z0:x0:t1",
            "sDebs": [
              "g1",
            ],
          },
          {
            "key": "z0:x0:t2",
            "sDebs": [
              "z0:x0:t1",
            ],
          },
          {
            "key": "z0:x0:t3",
            "sDebs": [
              "g1",
              "z0:x0:t1",
            ],
          },
          {
            "key": "z0:x0",
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
        storeName: 'test-store',
        state: [g1, z0],
        debug: dispatchSpy.debug,
      });

      store.dispatch(g1.actions.updateG1State());

      expect((store.state as any).slicesCurrentState).toMatchInlineSnapshot(`
        {
          "$nalanda/CORE_SLICE_READY": {
            "ready": false,
          },
          "g1": {
            "g1State": 1,
          },
          "z0": {},
          "z0:x0": {},
          "z0:x0:t1": {
            "self": 0,
            "t1State": "<unknown>",
          },
          "z0:x0:t2": {
            "self": 0,
            "t1State": "<unknown>",
          },
          "z0:x0:t3": {
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
            .find(
              (d) =>
                d.type === 'UPDATE_EFFECT' &&
                d.source.find((s) => s.sliceKey === CORE_SLICE_READY),
            ),
        ).toBeDefined();
      });

      expect((store.state as any).slicesCurrentState).toMatchInlineSnapshot(`
        {
          "$nalanda/CORE_SLICE_READY": {
            "ready": true,
          },
          "g1": {
            "g1State": 1,
          },
          "z0": {},
          "z0:x0": {},
          "z0:x0:t1": {
            "self": 2,
            "t1State": "(1+(1+<unknown>))",
          },
          "z0:x0:t2": {
            "self": 0,
            "t1State": "<unknown>",
          },
          "z0:x0:t3": {
            "g1State": "1",
            "self": 1,
            "t1State": "(1+(1+<unknown>))",
          },
        }
      `);

      expect(dispatchSpy.getSimplifiedTransactions()).toEqual([
        {
          actionId: 'updateG1State',
          dispatchSource: undefined,
          payload: [],
          sliceKey: 'g1',
        },
        {
          actionId: 'ready',
          dispatchSource: undefined,
          payload: [],
          sliceKey: '$nalanda/CORE_SLICE_READY',
        },
        {
          actionId: 'updateT1State',
          dispatchSource: 't1Effect',
          payload: [],
          sliceKey: 'z0:x0:t1',
        },
        {
          actionId: 'updateT1State',
          dispatchSource: 't2Effect',
          payload: [],
          sliceKey: 'z0:x0:t1',
        },
        {
          actionId: 'updateT3State',
          dispatchSource: 't3Effect',
          payload: [],
          sliceKey: 'z0:x0:t3',
        },
      ]);

      expect(dispatchSpy.getDebugLogItems()).toMatchInlineSnapshot(`
        [
          {
            "actionId": "updateG1State",
            "dispatcher": undefined,
            "payload": [],
            "slice": "g1",
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
            "name": "t1Effect",
            "source": [
              {
                "actionId": "updateG1State",
                "sliceKey": "g1",
              },
            ],
            "type": "SYNC_UPDATE_EFFECT",
          },
          {
            "actionId": "updateT1State",
            "dispatcher": "t1Effect",
            "payload": [],
            "slice": "z0:x0:t1",
            "store": "test-store",
            "txId": "<txId>",
            "type": "TX",
          },
          {
            "name": "t2Effect",
            "source": [
              {
                "actionId": "updateG1State",
                "sliceKey": "g1",
              },
              {
                "actionId": "updateT1State",
                "sliceKey": "z0:x0:t1",
              },
            ],
            "type": "SYNC_UPDATE_EFFECT",
          },
          {
            "actionId": "updateT1State",
            "dispatcher": "t2Effect",
            "payload": [],
            "slice": "z0:x0:t1",
            "store": "test-store",
            "txId": "<txId>",
            "type": "TX",
          },
          {
            "name": "t3Effect",
            "source": [
              {
                "actionId": "updateG1State",
                "sliceKey": "g1",
              },
              {
                "actionId": "updateT1State",
                "sliceKey": "z0:x0:t1",
              },
              {
                "actionId": "updateT1State",
                "sliceKey": "z0:x0:t1",
              },
            ],
            "type": "SYNC_UPDATE_EFFECT",
          },
          {
            "actionId": "updateT3State",
            "dispatcher": "t3Effect",
            "payload": [],
            "slice": "z0:x0:t3",
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
            "name": "t1Effect",
            "source": [
              {
                "actionId": "updateT1State",
                "sliceKey": "z0:x0:t1",
              },
              {
                "actionId": "updateT1State",
                "sliceKey": "z0:x0:t1",
              },
            ],
            "type": "SYNC_UPDATE_EFFECT",
          },
          {
            "name": "t2Effect",
            "source": [
              {
                "actionId": "updateT1State",
                "sliceKey": "z0:x0:t1",
              },
            ],
            "type": "SYNC_UPDATE_EFFECT",
          },
          {
            "name": "t3Effect",
            "source": [
              {
                "actionId": "updateT3State",
                "sliceKey": "z0:x0:t3",
              },
            ],
            "type": "SYNC_UPDATE_EFFECT",
          },
          {
            "name": "t1Effect",
            "source": [
              {
                "actionId": "updateG1State",
                "sliceKey": "g1",
              },
              {
                "actionId": "updateT1State",
                "sliceKey": "z0:x0:t1",
              },
              {
                "actionId": "updateT1State",
                "sliceKey": "z0:x0:t1",
              },
            ],
            "type": "UPDATE_EFFECT",
          },
          {
            "name": "t2Effect",
            "source": [
              {
                "actionId": "updateG1State",
                "sliceKey": "g1",
              },
              {
                "actionId": "updateT1State",
                "sliceKey": "z0:x0:t1",
              },
              {
                "actionId": "updateT1State",
                "sliceKey": "z0:x0:t1",
              },
            ],
            "type": "UPDATE_EFFECT",
          },
          {
            "name": "t3Effect",
            "source": [
              {
                "actionId": "updateG1State",
                "sliceKey": "g1",
              },
              {
                "actionId": "updateT1State",
                "sliceKey": "z0:x0:t1",
              },
              {
                "actionId": "updateT1State",
                "sliceKey": "z0:x0:t1",
              },
              {
                "actionId": "updateT3State",
                "sliceKey": "z0:x0:t3",
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
});
