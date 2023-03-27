import { testOverrideDependencies } from '../../test-helpers';
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

const createAnySliceBase = (name: string, deps: string[]): BareSlice => {
  return new Slice({
    name: name,
    initState: {},
    dependencies: deps.map((dep) => {
      return createAnySliceBase(dep, []) as AnySlice;
    }),
    actions: {},
    selector: () => {},
    reducer: (s) => s,
  });
};

let register = new Map<string, AnySlice>();

const createSlice = (name: string): AnySlice => {
  let slice = new Slice({
    name,
    initState: {},
    dependencies: [],
    actions: {},
    selector: () => {},
    reducer: (s) => s,
  });

  register.set(name, slice);

  return slice;
};

const sl0 = createSlice('0');
const sl1 = createSlice('1');
const sl2 = createSlice('2');
const sl3 = createSlice('3');
const sl4 = createSlice('4');
const sl5 = createSlice('5');
const sl6 = createSlice('6');
const sl7 = createSlice('7');

const slA = createSlice('A');
const slB = createSlice('B');
const slC = createSlice('C');
const slD = createSlice('D');
const slE = createSlice('E');
const slF = createSlice('F');
const slG = createSlice('G');
const slH = createSlice('H');
const slI = createSlice('I');
const slR = createSlice('R');
const slX = createSlice('X');
const slY = createSlice('Y');

const setDeps = (slice: AnySlice, deps: string[]) => {
  return testOverrideDependencies(slice, {
    dependencies: deps.map((r) => {
      let dep = register.get(r);

      if (!dep) {
        throw new Error(`Missing dependency: ${r}`);
      }

      return dep;
    }),
  });
};

describe('calcReverseDependencies', () => {
  describe('case 1', () => {
    const slices = [setDeps(sl1, ['2', '3'])];
    test('calcDependencies ', () => {
      expect(calcDependencies(slices)).toMatchInlineSnapshot(`
        {
          "l_1$": Set {
            "l_2$",
            "l_3$",
          },
        }
      `);
    });

    test('calcReverseDependencies ', () => {
      expect(calcReverseDependencies(slices)).toMatchInlineSnapshot(`
        {
          "l_2$": Set {
            "l_1$",
          },
          "l_3$": Set {
            "l_1$",
          },
        }
      `);
    });

    test('flattenReverseDependencies ', () => {
      expect(flattenReverseDependencies(calcReverseDependencies(slices)))
        .toMatchInlineSnapshot(`
        {
          "l_1$": Set {},
          "l_2$": Set {
            "l_1$",
          },
          "l_3$": Set {
            "l_1$",
          },
        }
      `);
    });
  });

  describe('case 2', () => {
    const slices = [
      setDeps(sl0, ['1']),
      setDeps(sl1, ['2', '3']),
      setDeps(sl2, ['3']),
      setDeps(sl3, []),
    ];
    test('calcDependencies ', () => {
      expect(calcDependencies(slices)).toMatchInlineSnapshot(`
        {
          "l_0$": Set {
            "l_1$",
          },
          "l_1$": Set {
            "l_2$",
            "l_3$",
          },
          "l_2$": Set {
            "l_3$",
          },
          "l_3$": Set {},
        }
      `);
    });

    test('calcReverseDependencies ', () => {
      expect(calcReverseDependencies(slices)).toMatchInlineSnapshot(`
        {
          "l_1$": Set {
            "l_0$",
          },
          "l_2$": Set {
            "l_1$",
          },
          "l_3$": Set {
            "l_1$",
            "l_2$",
          },
        }
      `);
    });

    test('flattenReverseDependencies ', () => {
      expect(flattenReverseDependencies(calcReverseDependencies(slices)))
        .toMatchInlineSnapshot(`
        {
          "l_0$": Set {},
          "l_1$": Set {
            "l_0$",
          },
          "l_2$": Set {
            "l_1$",
            "l_0$",
          },
          "l_3$": Set {
            "l_1$",
            "l_0$",
            "l_2$",
          },
        }
      `);
    });
  });

  describe('case 3', () => {
    const slices = [
      setDeps(sl0, ['1']),
      setDeps(sl1, ['2', '3']),
      setDeps(sl2, ['3']),
      setDeps(sl3, []),
    ];
    test('calcDependencies ', () => {
      expect(calcDependencies(slices)).toMatchInlineSnapshot(`
        {
          "l_0$": Set {
            "l_1$",
          },
          "l_1$": Set {
            "l_2$",
            "l_3$",
          },
          "l_2$": Set {
            "l_3$",
          },
          "l_3$": Set {},
        }
      `);
    });

    test('calcReverseDependencies ', () => {
      expect(calcReverseDependencies(slices)).toMatchInlineSnapshot(`
        {
          "l_1$": Set {
            "l_0$",
          },
          "l_2$": Set {
            "l_1$",
          },
          "l_3$": Set {
            "l_1$",
            "l_2$",
          },
        }
      `);
    });

    test('flattenReverseDependencies ', () => {
      expect(flattenReverseDependencies(calcReverseDependencies(slices)))
        .toMatchInlineSnapshot(`
        {
          "l_0$": Set {},
          "l_1$": Set {
            "l_0$",
          },
          "l_2$": Set {
            "l_1$",
            "l_0$",
          },
          "l_3$": Set {
            "l_1$",
            "l_0$",
            "l_2$",
          },
        }
      `);
    });
  });

  describe('case 4.a', () => {
    const slices = [
      setDeps(sl0, ['1']),
      setDeps(sl1, ['2']),
      setDeps(sl2, ['3']),
      setDeps(sl3, ['4']),
    ];
    test('calcDependencies ', () => {
      expect(calcDependencies(slices)).toMatchInlineSnapshot(`
        {
          "l_0$": Set {
            "l_1$",
          },
          "l_1$": Set {
            "l_2$",
          },
          "l_2$": Set {
            "l_3$",
          },
          "l_3$": Set {
            "l_4$",
          },
        }
      `);
    });

    test('calcReverseDependencies ', () => {
      expect(calcReverseDependencies(slices)).toMatchInlineSnapshot(`
        {
          "l_1$": Set {
            "l_0$",
          },
          "l_2$": Set {
            "l_1$",
          },
          "l_3$": Set {
            "l_2$",
          },
          "l_4$": Set {
            "l_3$",
          },
        }
      `);
    });

    test('flattenReverseDependencies ', () => {
      expect(flattenReverseDependencies(calcReverseDependencies(slices)))
        .toMatchInlineSnapshot(`
        {
          "l_0$": Set {},
          "l_1$": Set {
            "l_0$",
          },
          "l_2$": Set {
            "l_1$",
            "l_0$",
          },
          "l_3$": Set {
            "l_2$",
            "l_1$",
            "l_0$",
          },
          "l_4$": Set {
            "l_3$",
            "l_2$",
            "l_1$",
            "l_0$",
          },
        }
      `);
    });
  });

  describe('case 4.b', () => {
    const slices = [
      setDeps(sl1, ['2', '3']),
      setDeps(slA, ['2', '3']),
      setDeps(slB, ['A', '1']),
    ];
    test('calcDependencies ', () => {
      expect(calcDependencies(slices)).toMatchInlineSnapshot(`
        {
          "l_1$": Set {
            "l_2$",
            "l_3$",
          },
          "l_A$": Set {
            "l_2$",
            "l_3$",
          },
          "l_B$": Set {
            "l_A$",
            "l_1$",
          },
        }
      `);
    });

    test('calcReverseDependencies ', () => {
      expect(calcReverseDependencies(slices)).toMatchInlineSnapshot(`
        {
          "l_1$": Set {
            "l_B$",
          },
          "l_2$": Set {
            "l_1$",
            "l_A$",
          },
          "l_3$": Set {
            "l_1$",
            "l_A$",
          },
          "l_A$": Set {
            "l_B$",
          },
        }
      `);
    });

    test('flattenReverseDependencies ', () => {
      expect(flattenReverseDependencies(calcReverseDependencies(slices)))
        .toMatchInlineSnapshot(`
        {
          "l_1$": Set {
            "l_B$",
          },
          "l_2$": Set {
            "l_1$",
            "l_B$",
            "l_A$",
          },
          "l_3$": Set {
            "l_1$",
            "l_B$",
            "l_A$",
          },
          "l_A$": Set {
            "l_B$",
          },
          "l_B$": Set {},
        }
      `);
    });
  });

  describe('case 5', () => {
    const slices = [
      setDeps(slD, ['A', 'B', 'C']),
      setDeps(slA, ['B']),
      setDeps(slB, []),
      setDeps(slC, ['B']),
    ];
    test('calcDependencies ', () => {
      expect(calcDependencies(slices)).toMatchInlineSnapshot(`
        {
          "l_A$": Set {
            "l_B$",
          },
          "l_B$": Set {},
          "l_C$": Set {
            "l_B$",
          },
          "l_D$": Set {
            "l_A$",
            "l_B$",
            "l_C$",
          },
        }
      `);
    });

    test('calcReverseDependencies ', () => {
      expect(calcReverseDependencies(slices)).toMatchInlineSnapshot(`
        {
          "l_A$": Set {
            "l_D$",
          },
          "l_B$": Set {
            "l_D$",
            "l_A$",
            "l_C$",
          },
          "l_C$": Set {
            "l_D$",
          },
        }
      `);
    });

    test('flattenReverseDependencies ', () => {
      expect(flattenReverseDependencies(calcReverseDependencies(slices)))
        .toMatchInlineSnapshot(`
        {
          "l_A$": Set {
            "l_D$",
          },
          "l_B$": Set {
            "l_D$",
            "l_A$",
            "l_C$",
          },
          "l_C$": Set {
            "l_D$",
          },
          "l_D$": Set {},
        }
      `);
    });
  });

  describe('case 6', () => {
    const slices = [
      setDeps(slX, ['C', 'A', 'B']),
      setDeps(slC, ['F', 'R']),
      setDeps(slF, ['B']),
      setDeps(slR, ['B']),
      setDeps(slA, []),
      setDeps(slB, []),
    ];
    test('calcDependencies ', () => {
      expect(calcDependencies(slices)).toMatchInlineSnapshot(`
        {
          "l_A$": Set {},
          "l_B$": Set {},
          "l_C$": Set {
            "l_F$",
            "l_R$",
          },
          "l_F$": Set {
            "l_B$",
          },
          "l_R$": Set {
            "l_B$",
          },
          "l_X$": Set {
            "l_C$",
            "l_A$",
            "l_B$",
          },
        }
      `);
    });

    test('calcReverseDependencies ', () => {
      expect(calcReverseDependencies(slices)).toMatchInlineSnapshot(`
        {
          "l_A$": Set {
            "l_X$",
          },
          "l_B$": Set {
            "l_X$",
            "l_F$",
            "l_R$",
          },
          "l_C$": Set {
            "l_X$",
          },
          "l_F$": Set {
            "l_C$",
          },
          "l_R$": Set {
            "l_C$",
          },
        }
      `);
    });

    test('flattenReverseDependencies ', () => {
      expect(flattenReverseDependencies(calcReverseDependencies(slices)))
        .toMatchInlineSnapshot(`
        {
          "l_A$": Set {
            "l_X$",
          },
          "l_B$": Set {
            "l_X$",
            "l_F$",
            "l_C$",
            "l_R$",
          },
          "l_C$": Set {
            "l_X$",
          },
          "l_F$": Set {
            "l_C$",
            "l_X$",
          },
          "l_R$": Set {
            "l_C$",
            "l_X$",
          },
          "l_X$": Set {},
        }
      `);
    });
  });

  describe('case 7', () => {
    const slices = [
      setDeps(slE, ['F', 'G', 'H']),
      setDeps(slF, ['B', 'G']),
      setDeps(slG, ['B']),
      setDeps(slH, ['B']),
      setDeps(slI, ['B']),
      setDeps(slB, ['A', 'D']),
      setDeps(slA, ['X']),
      setDeps(slD, ['X']),
      setDeps(slC, ['D', 'X']),
      setDeps(slX, []),
    ];
    test('calcDependencies ', () => {
      expect(calcDependencies(slices)).toMatchInlineSnapshot(`
        {
          "l_A$": Set {
            "l_X$",
          },
          "l_B$": Set {
            "l_A$",
            "l_D$",
          },
          "l_C$": Set {
            "l_D$",
            "l_X$",
          },
          "l_D$": Set {
            "l_X$",
          },
          "l_E$": Set {
            "l_F$",
            "l_G$",
            "l_H$",
          },
          "l_F$": Set {
            "l_B$",
            "l_G$",
          },
          "l_G$": Set {
            "l_B$",
          },
          "l_H$": Set {
            "l_B$",
          },
          "l_I$": Set {
            "l_B$",
          },
          "l_X$": Set {},
        }
      `);
    });

    test('calcReverseDependencies ', () => {
      expect(calcReverseDependencies(slices)).toMatchInlineSnapshot(`
        {
          "l_A$": Set {
            "l_B$",
          },
          "l_B$": Set {
            "l_F$",
            "l_G$",
            "l_H$",
            "l_I$",
          },
          "l_D$": Set {
            "l_B$",
            "l_C$",
          },
          "l_F$": Set {
            "l_E$",
          },
          "l_G$": Set {
            "l_E$",
            "l_F$",
          },
          "l_H$": Set {
            "l_E$",
          },
          "l_X$": Set {
            "l_A$",
            "l_D$",
            "l_C$",
          },
        }
      `);
    });

    test('flattenReverseDependencies ', () => {
      expect(flattenReverseDependencies(calcReverseDependencies(slices)))
        .toMatchInlineSnapshot(`
        {
          "l_A$": Set {
            "l_B$",
            "l_F$",
            "l_E$",
            "l_G$",
            "l_H$",
            "l_I$",
          },
          "l_B$": Set {
            "l_F$",
            "l_E$",
            "l_G$",
            "l_H$",
            "l_I$",
          },
          "l_C$": Set {},
          "l_D$": Set {
            "l_B$",
            "l_F$",
            "l_E$",
            "l_G$",
            "l_H$",
            "l_I$",
            "l_C$",
          },
          "l_E$": Set {},
          "l_F$": Set {
            "l_E$",
          },
          "l_G$": Set {
            "l_E$",
            "l_F$",
          },
          "l_H$": Set {
            "l_E$",
          },
          "l_I$": Set {},
          "l_X$": Set {
            "l_A$",
            "l_B$",
            "l_F$",
            "l_E$",
            "l_G$",
            "l_H$",
            "l_I$",
            "l_D$",
            "l_C$",
          },
        }
      `);
    });
  });
});
