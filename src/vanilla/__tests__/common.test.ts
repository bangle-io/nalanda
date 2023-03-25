import {
  calcDependencies,
  calcReverseDependencies,
  flattenReverseDependencies,
} from '../helpers';
import { rejectAny } from '../internal-types';
import { AnySlice } from '../public-types';
import { BareSlice, Slice } from '../slice';

test('reject any', () => {
  let _control: any = {};
  let _control2 = {};
  let _control3 = 4;
  let _control4 = { foo: {} as any };

  // @ts-expect-error - we are testing the rejectAny function
  rejectAny(_control);
  rejectAny(_control2);
  rejectAny(_control3);
  // @ts-expect-error - we are testing the rejectAny function
  rejectAny(_control4.foo);

  expect(true).toBe(true);
});

describe('calcReverseDependencies', () => {
  const createAnySliceBase = (name: string, deps: string[]): BareSlice => {
    return new Slice({
      name: name,
      initState: {},
      dependencies: deps.map((dep) => {
        return createAnySliceBase(dep, []) as AnySlice;
      }),
      actions: {},
      selectors: {},
      reducer: (s) => s,
    });
  };

  describe.each([
    {
      name: '1',
      slices: [createAnySliceBase('sl1', ['sl2', 'sl3'])],
      dep: {
        key_sl1: new Set(['key_sl2', 'key_sl3']),
      },
      reverseDep: {
        key_sl2: new Set(['key_sl1']),
        key_sl3: new Set(['key_sl1']),
      },
      flatReverseDep: {
        key_sl1: new Set([]),
        key_sl2: new Set(['key_sl1']),
        key_sl3: new Set(['key_sl1']),
      },
    },
    {
      name: '2',
      slices: [
        createAnySliceBase('sl0', ['sl1']),
        createAnySliceBase('sl1', ['sl2', 'sl3']),
        createAnySliceBase('sl2', ['sl3']),
        createAnySliceBase('sl3', []),
      ],
      dep: {
        key_sl0: new Set(['key_sl1']),
        key_sl1: new Set(['key_sl2', 'key_sl3']),
        key_sl2: new Set(['key_sl3']),
        key_sl3: new Set([]),
      },
      reverseDep: {
        key_sl1: new Set(['key_sl0']),
        key_sl2: new Set(['key_sl1']),
        key_sl3: new Set(['key_sl1', 'key_sl2']),
      },
      flatReverseDep: {
        key_sl0: new Set([]),
        key_sl1: new Set(['key_sl0']),
        key_sl2: new Set(['key_sl0', 'key_sl1']),
        key_sl3: new Set(['key_sl0', 'key_sl1', 'key_sl2']),
      },
    },
    {
      name: '3',
      slices: [
        createAnySliceBase('sl0', ['sl1']),
        createAnySliceBase('sl1', ['sl2', 'sl3']),
        createAnySliceBase('sl2', ['sl3']),
        createAnySliceBase('sl3', []),
      ],
      dep: {
        key_sl0: new Set(['key_sl1']),
        key_sl1: new Set(['key_sl2', 'key_sl3']),
        key_sl2: new Set(['key_sl3']),
        key_sl3: new Set([]),
      },
      reverseDep: {
        key_sl1: new Set(['key_sl0']),
        key_sl2: new Set(['key_sl1']),
        key_sl3: new Set(['key_sl1', 'key_sl2']),
      },
      flatReverseDep: {
        key_sl0: new Set([]),
        key_sl1: new Set(['key_sl0']),
        key_sl2: new Set(['key_sl0', 'key_sl1']),
        key_sl3: new Set(['key_sl0', 'key_sl1', 'key_sl2']),
      },
    },
    {
      name: '4',
      slices: [
        createAnySliceBase('sl0', ['sl1']),
        createAnySliceBase('sl1', ['sl2']),
        createAnySliceBase('sl2', ['sl3']),
        createAnySliceBase('sl3', ['sl4']),
      ],
      dep: {
        key_sl0: new Set(['key_sl1']),
        key_sl1: new Set(['key_sl2']),
        key_sl2: new Set(['key_sl3']),
        key_sl3: new Set(['key_sl4']),
      },
      reverseDep: {
        key_sl1: new Set(['key_sl0']),
        key_sl2: new Set(['key_sl1']),
        key_sl3: new Set(['key_sl2']),
        key_sl4: new Set(['key_sl3']),
      },
      flatReverseDep: {
        key_sl0: new Set([]),
        key_sl1: new Set(['key_sl0']),
        key_sl2: new Set(['key_sl0', 'key_sl1']),
        key_sl3: new Set(['key_sl0', 'key_sl1', 'key_sl2']),
        key_sl4: new Set(['key_sl0', 'key_sl1', 'key_sl2', 'key_sl3']),
      },
    },

    {
      name: '4',
      slices: [
        createAnySliceBase('sl1', ['sl2', 'sl3']),
        createAnySliceBase('slA', ['sl2', 'sl3']),
        createAnySliceBase('slB', ['slA', 'sl1']),
      ],
      dep: {
        key_sl1: new Set(['key_sl2', 'key_sl3']),
        key_slA: new Set(['key_sl2', 'key_sl3']),
        key_slB: new Set(['key_slA', 'key_sl1']),
      },
      reverseDep: {
        key_sl1: new Set(['key_slB']),
        key_sl2: new Set(['key_slA', 'key_sl1']),
        key_sl3: new Set(['key_slA', 'key_sl1']),
        key_slA: new Set(['key_slB']),
      },
      flatReverseDep: {
        key_sl1: new Set(['key_slB']),
        key_sl2: new Set(['key_slA', 'key_sl1', 'key_slB']),
        key_sl3: new Set(['key_slA', 'key_sl1', 'key_slB']),
        key_slA: new Set(['key_slB']),
        key_slB: new Set([]),
      },
    },

    {
      name: '5',
      slices: [
        createAnySliceBase('D', ['A', 'B', 'C']),
        createAnySliceBase('A', ['B']),
        createAnySliceBase('B', []),
        createAnySliceBase('C', ['B']),
      ],
      dep: {
        key_D: new Set(['key_A', 'key_B', 'key_C']),
        key_A: new Set(['key_B']),
        key_B: new Set([]),
        key_C: new Set(['key_B']),
      },
      reverseDep: {
        key_A: new Set(['key_D']),
        key_B: new Set(['key_A', 'key_C', 'key_D']),
        key_C: new Set(['key_D']),
      },
      flatReverseDep: {
        key_A: new Set(['key_D']),
        key_B: new Set(['key_A', 'key_C', 'key_D']),
        key_C: new Set(['key_D']),
        key_D: new Set([]),
      },
    },

    {
      name: '6',
      slices: [
        createAnySliceBase('X', ['C', 'A', 'B']),
        createAnySliceBase('C', ['F', 'R']),
        createAnySliceBase('F', ['B']),
        createAnySliceBase('R', ['B']),
        createAnySliceBase('A', []),
        createAnySliceBase('B', []),
      ],
      dep: {
        key_X: new Set(['key_C', 'key_A', 'key_B']),
        key_C: new Set(['key_F', 'key_R']),
        key_F: new Set(['key_B']),
        key_R: new Set(['key_B']),
        key_A: new Set([]),
        key_B: new Set([]),
      },
      reverseDep: {
        key_C: new Set(['key_X']),
        key_F: new Set(['key_C']),
        key_R: new Set(['key_C']),
        key_A: new Set(['key_X']),
        key_B: new Set(['key_F', 'key_R', 'key_X']),
      },
      flatReverseDep: {
        key_C: new Set(['key_X']),
        key_F: new Set(['key_C', 'key_X']),
        key_R: new Set(['key_C', 'key_X']),
        key_A: new Set(['key_X']),
        key_B: new Set(['key_F', 'key_R', 'key_C', 'key_X']),
        key_X: new Set([]),
      },
    },

    {
      name: '7',
      slices: [
        createAnySliceBase('E', ['F', 'G', 'H']),
        createAnySliceBase('F', ['B', 'G']),
        createAnySliceBase('G', ['B']),
        createAnySliceBase('H', ['B']),
        createAnySliceBase('I', ['B']),
        createAnySliceBase('B', ['A', 'D']),
        createAnySliceBase('A', ['X']),
        createAnySliceBase('D', ['X']),
        createAnySliceBase('C', ['D', 'X']),
        createAnySliceBase('X', []),
      ],
      dep: {
        key_E: new Set(['key_F', 'key_G', 'key_H']),
        key_F: new Set(['key_B', 'key_G']),
        key_G: new Set(['key_B']),
        key_H: new Set(['key_B']),
        key_I: new Set(['key_B']),
        key_B: new Set(['key_A', 'key_D']),
        key_A: new Set(['key_X']),
        key_D: new Set(['key_X']),
        key_C: new Set(['key_D', 'key_X']),
        key_X: new Set([]),
      },
      reverseDep: {
        key_F: new Set(['key_E']),
        key_G: new Set(['key_E', 'key_F']),
        key_H: new Set(['key_E']),
        key_B: new Set(['key_F', 'key_G', 'key_H', 'key_I']),
        key_A: new Set(['key_B']),
        key_D: new Set(['key_B', 'key_C']),
        key_X: new Set(['key_A', 'key_D', 'key_C']),
      },
      flatReverseDep: {
        key_F: new Set(['key_E']),
        key_G: new Set(['key_E', 'key_F']),
        key_H: new Set(['key_E']),
        key_I: new Set([]),
        key_B: new Set(['key_E', 'key_G', 'key_H', 'key_I', 'key_F']),
        key_A: new Set(['key_B', 'key_E', 'key_G', 'key_H', 'key_I', 'key_F']),
        key_D: new Set([
          'key_B',
          'key_C',
          'key_E',
          'key_G',
          'key_H',
          'key_I',
          'key_F',
        ]),
        key_X: new Set([
          'key_A',
          'key_C',
          'key_D',
          'key_B',
          'key_E',
          'key_G',
          'key_H',
          'key_I',
          'key_F',
        ]),
        key_E: new Set([]),
        key_C: new Set([]),
      },
    },
  ])('dep calcs', ({ name, slices, dep, reverseDep, flatReverseDep }) => {
    test('calcDependencies ' + name, () => {
      expect(calcDependencies(slices)).toEqual(dep);
    });

    test('calcReverseDependencies ' + name, () => {
      expect(calcReverseDependencies(slices)).toEqual(reverseDep);
    });

    test('flattenReverseDependencies ' + name, () => {
      expect(
        flattenReverseDependencies(calcReverseDependencies(slices)),
      ).toEqual(flatReverseDep);
    });
  });
});
