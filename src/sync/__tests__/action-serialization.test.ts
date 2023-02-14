import { z } from 'zod';

import { ActionSerializer, serialAction } from '../action-serializer';
import { createKey, slice } from '../../vanilla/create';
import { zodFindUnsafeTypes } from '../zod';
import { expectType } from '../../vanilla/internal-types';

test('checks work', () => {
  let case1 = slice({
    key: createKey('ji', [], {
      magic: 3,
    }),
    actions: {
      nonSerial: (payload: string) => (state) => state,
      serial: serialAction(z.string(), (payload: string) => (state) => state),
    },
  });

  const actionS1 = ActionSerializer.create(case1);

  expect(actionS1.isSyncReady()).toBe(false);

  let case2 = slice({
    key: createKey('ji', [], {
      magic: 3,
    }),
    actions: {
      serial: serialAction(z.string(), (payload) => (state) => state),
    },
  });

  const actionS2 = ActionSerializer.create(case2);

  expect(actionS2.isSyncReady()).toBe(true);

  let case3 = slice({
    key: createKey('ji', [], {
      magic: 3,
    }),
    actions: {},
  });

  const actionS3 = ActionSerializer.create(case3);

  expect(actionS3.isSyncReady()).toBe(true);

  let case4 = slice({
    key: createKey('ji', [], {
      magic: 3,
    }),
    actions: {},
  });

  const actionS4 = ActionSerializer.create(case4);

  expect(actionS4.isSyncReady()).toBe(true);

  let case5 = slice({
    key: createKey('ji', [], {
      magic: 3,
    }),
    actions: {
      serial: serialAction(z.string(), (payload) => (state) => state),
      serial2: serialAction(z.string(), (payload) => (state) => state),
    },
  });

  const actionS5 = ActionSerializer.create(case5);

  expect(actionS5.isSyncReady()).toBe(true);
});

test('typing is correct', () => {
  slice({
    key: createKey('ji', [], {
      magic: 3,
    }),
    actions: {
      serial: serialAction(z.string(), (payload) => {
        // @ts-expect-error payload should not be any
        let testVal0 = payload.xyzTest;

        expectType<string>(payload);

        return (state) => {
          // @ts-expect-error state should not be any
          let testVal1 = state.xyzTest;

          expectType<{ magic: number }>(state);

          return state;
        };
      }),

      serial2: serialAction(
        z.string(),
        (payload) => (state) =>
          // @ts-expect-error returning null should error
          null,
      ),
    },
  });
});

test('serialization works', () => {
  let mySlice = slice({
    key: createKey('ji', [], {
      magic: 3,
    }),
    actions: {
      myAction1: serialAction(
        z.object({
          number: z.number(),
          key: z.string(),
          map: z.map(z.string(), z.number()),
        }),
        (payload) => {
          return (state) => state;
        },
        {
          serialize: (schema, [payload]) => {
            return JSON.stringify({
              number: payload.number,
              key: payload.key,
              map: Array.from(payload.map),
            });
          },
          parse: (schema, str) => {
            if (typeof str !== 'string') {
              throw new Error('In parse expected string type');
            }
            let obj = JSON.parse(str);

            return [
              {
                number: obj.number,
                key: obj.key,
                map: new Map<string, number>(obj.map),
              },
            ];
          },
        },
      ),

      myAction2: serialAction(z.boolean(), (payload) => (state) => state, {
        serialize: (schema, [payload]) => {
          return JSON.stringify(payload);
        },
        parse: (schema, str) => {
          if (typeof str !== 'string') {
            throw new Error('In parse expected string type');
          }
          let obj = JSON.parse(str);

          return [obj];
        },
      }),
    },
  });

  const val1 = {
    number: 3,
    key: 'key',
    map: new Map([['key', 3]]),
  };

  const actionS1 = ActionSerializer.create(mySlice);

  let serial1 = actionS1.serializeActionPayload('myAction1', [val1]);

  expect(serial1).toMatchInlineSnapshot(
    `"{"number":3,"key":"key","map":[["key",3]]}"`,
  );

  expect(actionS1.parseActionPayload('myAction1', serial1)).toEqual([val1]);

  let serial2 = actionS1.serializeActionPayload('myAction2', [false]);

  expect(serial2).toMatchInlineSnapshot(`"false"`);

  expect(actionS1.parseActionPayload('myAction2', serial2)).toEqual([false]);
});

describe('zodFindUnsafeTypes', () => {
  test('catches functions', () => {
    const schema = z.object({
      a: z.function().optional(),
    });

    expect(zodFindUnsafeTypes(schema)).toEqual(['ZodFunction']);

    expect(
      zodFindUnsafeTypes(
        z.object({
          a: z.function().nullable(),
        }),
      ),
    ).toEqual(['ZodFunction']);

    expect(
      zodFindUnsafeTypes(
        z.object({
          foo: z.object({
            foo: z.object({
              a: z.function().nullable(),
            }),
          }),
        }),
      ),
    ).toEqual(['ZodFunction']);
  });

  test('works', () => {
    expect(
      zodFindUnsafeTypes(
        z.object({
          a: z.record(z.number()),
        }),
      ),
    ).toEqual([]);

    expect(
      zodFindUnsafeTypes(
        z.object({
          a: z.record(z.number()),
        }),
      ),
    ).toEqual([]);
  });

  test('works with action', () => {
    expect(() =>
      slice({
        key: createKey('ji', [], {
          magic: 3,
        }),
        actions: {
          myAction1: serialAction(
            z.object({
              number: z.number(),
              key: z.string(),
              map: z.any(),
            }),
            (payload) => (state) => state,
          ),
        },
      }),
    ).toThrowError(`serialAction: schema contains unsafe types: ZodAny`);
  });
});
