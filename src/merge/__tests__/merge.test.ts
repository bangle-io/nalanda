import { mergeSlices } from '..';
import { createSlice } from '../../vanilla/create';
import { timeoutSchedular } from '../../vanilla/effect';
import { Slice } from '../../vanilla/slice';
import { Store } from '../../vanilla/store';

function sleep(t = 20): Promise<void> {
  return new Promise((res) => setTimeout(res, t));
}

describe('merging', () => {
  test('works', () => {
    const g1 = createSlice([], {
      key: 'g1',
      initState: {},
      actions: {},
    });

    const t1 = createSlice([g1], {
      key: 't1',
      initState: {},
      actions: {},
    });

    const x0 = mergeSlices({
      key: 'x0',
      children: [t1],
    });

    expect(
      x0._bare.children?.map((r) => ({
        key: r.key,
        sDebs: r._bare.siblingAndDependencies,
        sMod: r._bare.siblingAndDependenciesAccessModifier,
      })),
    ).toMatchInlineSnapshot(`
      [
        {
          "key": "x0:t1",
          "sDebs": [],
          "sMod": "x0",
        },
      ]
    `);
    const z0 = mergeSlices({
      key: 'z0',
      children: [x0],
    });

    expect(z0._bare.siblingAndDependencies).toMatchInlineSnapshot(`undefined`);
    expect(z0._bare.siblingAndDependenciesAccessModifier).toMatchInlineSnapshot(
      `undefined`,
    );

    expect(
      z0._bare.children?.map((r) => ({
        key: r.key,
        sDebs: r._bare.siblingAndDependencies,
        sMod: r._bare.siblingAndDependenciesAccessModifier,
      })),
    ).toMatchInlineSnapshot(`
      [
        {
          "key": "z0:x0:t1",
          "sDebs": [],
          "sMod": "z0:x0",
        },
        {
          "key": "z0:x0",
          "sDebs": [],
          "sMod": "z0",
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
            debugger;
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

    const t3 = createSlice([g1, t1], {
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
    });

    const x0 = mergeSlices({
      key: 'x0',
      children: [t1, t2, t3],
    });

    const z0 = mergeSlices({
      key: 'z0',
      children: [x0],
    });

    test('state looks okay', () => {
      expect(
        x0._bare.children?.map((r) => ({
          key: r.key,
          sDebs: r._bare.siblingAndDependencies,
          sMod: r._bare.siblingAndDependenciesAccessModifier,
        })),
      ).toMatchInlineSnapshot(`
              [
                {
                  "key": "x0:t1",
                  "sDebs": [],
                  "sMod": "x0",
                },
                {
                  "key": "x0:t2",
                  "sDebs": [
                    "t1",
                  ],
                  "sMod": "x0",
                },
                {
                  "key": "x0:t3",
                  "sDebs": [
                    "t1",
                  ],
                  "sMod": "x0",
                },
              ]
          `);

      expect(z0._bare.siblingAndDependencies).toMatchInlineSnapshot(
        `undefined`,
      );
      expect(
        z0._bare.siblingAndDependenciesAccessModifier,
      ).toMatchInlineSnapshot(`undefined`);

      let result: any[] = [];

      [...(z0._bare.children || []), z0]?.map((r) => {
        let miniResult: string[] = [];
        for (const sl of [g1, t1, t2, t3, x0, z0]) {
          miniResult.push([sl.key, r._bare.keyMapping?.(sl.key)].join('>'));
        }
        result.push([r.key, miniResult.join(', ')]);
      });

      expect(result).toMatchInlineSnapshot(`
              [
                [
                  "z0:x0:t1",
                  "g1>g1, t1>t1, t2>t2, t3>t3, x0>x0, z0>z0",
                ],
                [
                  "z0:x0:t2",
                  "g1>g1, t1>z0:x0:t1, t2>t2, t3>t3, x0>x0, z0>z0",
                ],
                [
                  "z0:x0:t3",
                  "g1>g1, t1>z0:x0:t1, t2>t2, t3>t3, x0>x0, z0>z0",
                ],
                [
                  "z0:x0",
                  "g1>g1, t1>t1, t2>t2, t3>t3, x0>x0, z0>z0",
                ],
                [
                  "z0",
                  "g1>, t1>, t2>, t3>, x0>, z0>",
                ],
              ]
          `);

      expect(
        z0._bare.children?.map((r) => ({
          key: r.key,
          sDebs: r._bare.siblingAndDependencies,
          sMod: r._bare.siblingAndDependenciesAccessModifier,
        })),
      ).toMatchInlineSnapshot(`
              [
                {
                  "key": "z0:x0:t1",
                  "sDebs": [],
                  "sMod": "z0:x0",
                },
                {
                  "key": "z0:x0:t2",
                  "sDebs": [
                    "t1",
                  ],
                  "sMod": "z0:x0",
                },
                {
                  "key": "z0:x0:t3",
                  "sDebs": [
                    "t1",
                  ],
                  "sMod": "z0:x0",
                },
                {
                  "key": "z0:x0",
                  "sDebs": [],
                  "sMod": "z0",
                },
              ]
          `);
    });

    test.only('state looks okay', async () => {
      const store = Store.create({
        scheduler: timeoutSchedular(0),
        storeName: 'test-store',
        state: [g1, z0],
      });

      store.dispatch(g1.actions.updateG1State());

      expect((store.state as any).slicesCurrentState).toMatchInlineSnapshot(`
        {
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

      await sleep(10);

      expect((store.state as any).slicesCurrentState).toMatchInlineSnapshot(`
        {
          "g1": {
            "g1State": 1,
          },
          "z0": {},
          "z0:x0": {},
          "z0:x0:t1": {
            "self": 1,
            "t1State": "(1+<unknown>)",
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
    });
  });
});
