import { IfEquals, expectType } from '../types';
import { StoreState } from '../store-state';
import { testCleanup } from '../helpers/test-cleanup';
import { Transaction } from '../transaction';
import { InferStateSliceName } from '../types';

import { beforeEach, describe, expect, test } from '@jest/globals';
import { createKey } from '../slice/key';
import { shallowEqual } from '../helpers/shallow-equal';

beforeEach(() => {
  testCleanup();
});

describe('SliceKey Mechanism', () => {
  test('single slice functionality', () => {
    const sliceKeyA = createKey('SliceA', []);
    const fieldA = sliceKeyA.field(1);

    const sliceA = sliceKeyA.slice({
      fields: {
        valueA: fieldA,
      },
    });

    const initialState = StoreState.create({
      slices: [sliceA],
    });

    const derivedSelectorA = sliceKeyA.derive((state) => {
      type SliceIdentifier = InferStateSliceName<typeof state>;

      () => {
        let inferredSlice: SliceIdentifier = {} as any;
        inferredSlice = 'SliceA';
        // @ts-expect-error not a dependency
        inferredSlice = 'SliceB';
      };

      return { valueA: sliceA.get(state).valueA };
    });

    expect(derivedSelectorA.get(initialState)).toEqual({ valueA: 1 });
  });

  describe('interactions between multiple slices', () => {
    // SliceA
    const sliceKeyA = createKey('SliceA', []);
    const fieldA = sliceKeyA.field(1);
    const sliceA = sliceKeyA.slice({
      fields: {
        valueA: fieldA,
      },
    });

    // SliceB
    const sliceKeyB = createKey('SliceB', []);
    const fieldB = sliceKeyB.field(1);
    const sliceB = sliceKeyB.slice({
      fields: {
        valueB: fieldB,
      },
    });

    // SliceC with dependency on SliceA
    const sliceKeyC = createKey('SliceC', [sliceA]);
    const fieldC = sliceKeyC.field(15);
    const sliceC = sliceKeyC.slice({
      fields: {
        valueC: fieldC,
      },
    });

    const storeState = StoreState.create({
      slices: [sliceA, sliceC],
    });

    test('ensures correct type relationships between slices', () => {
      const derivedSelectorC = sliceKeyC.derive((state) => {
        expectType<StoreState<'SliceA' | 'SliceC'>, typeof state>(state);

        type SliceIdentifier = InferStateSliceName<typeof state>;

        () => {
          let inferredSlice: SliceIdentifier = {} as any;
          expectType<'SliceA' | 'SliceC', typeof inferredSlice>(inferredSlice);
          inferredSlice = 'SliceA';
          inferredSlice = 'SliceC';
          // @ts-expect-error should fail as SliceB is not a dependency of SliceC
          inferredSlice = 'SliceB';
        };
        () => {
          // @ts-expect-error should fail as SliceB is not a dependency
          sliceKeyB.get(state);
          // @ts-expect-error should fail as SliceB is not a dependency
          sliceB.get(state);
        };

        sliceA.get(state);
        sliceC.get(state);
        sliceA.get(state);

        expect(sliceA.get(state)).toEqual({ valueA: 1 });
        expect(fieldA.get(state)).toEqual(1);

        expect(sliceC.get(state)).toEqual({ valueC: 15 });
        expect(fieldC.get(state)).toEqual(15);

        return {
          combinedValue: sliceC.get(state).valueC + sliceA.get(state).valueA,
        };
      });

      expect(derivedSelectorC.get(storeState)).toEqual({
        combinedValue: 16,
      });
    });
  });

  describe('Equality Behavior', () => {
    test('should return the same instance when values are equal', () => {
      let callCount = 0;
      const sliceKeyA = createKey('mySliceA', []);
      const fieldA = sliceKeyA.field(1);

      const derivedSelectorA = sliceKeyA.derive(
        (state) => {
          callCount++;
          return { value: fieldA.get(state) };
        },
        {
          equal: (prev, next) => {
            expectType<{ value: number }, typeof prev>(prev);
            expectType<{ value: number }, typeof next>(next);
            return prev.value === next.value;
          },
        },
      );

      const sliceA = sliceKeyA.slice({ fields: { derivedSelectorA } });

      const sliceKeyB = createKey('mySliceB', []);
      const fieldB = sliceKeyB.field(1);
      const sliceB = sliceKeyB.slice({
        fields: {
          fieldB: fieldB,
        },
      });

      function updateFieldB() {
        return fieldB.update(2);
      }

      const initialState = StoreState.create({
        slices: [sliceB, sliceA],
      });

      const initialDerivedValue = derivedSelectorA.get(initialState);
      expect(initialDerivedValue).toEqual({ value: 1 });

      const updatedState = initialState.apply(updateFieldB());

      expect(sliceB.get(updatedState)).toEqual({ fieldB: 2 });

      expect(sliceA.get(updatedState).derivedSelectorA).toBe(
        sliceA.get(initialState).derivedSelectorA,
      );

      expect(derivedSelectorA.get(updatedState)).toBe(initialDerivedValue);
      expect(callCount).toBe(2);
    });

    test('should create a new instance for separately created states', () => {
      const sliceKeyA = createKey('mySliceA', []);
      const fieldA = sliceKeyA.field(1);
      const sliceA = sliceKeyA.slice({ fields: {} });
      const initialState = StoreState.create({
        slices: [sliceA],
      });
      let callCount = 0;

      const derivedSelectorA = sliceKeyA.derive(
        (state) => {
          callCount++;
          return { value: fieldA.get(state) };
        },
        {
          equal: (prev, next) => {
            expectType<{ value: number }, typeof prev>(prev);
            expectType<{ value: number }, typeof next>(next);
            return prev.value === next.value;
          },
        },
      );

      const initialDerivedValue = derivedSelectorA.get(initialState);
      expect(initialDerivedValue).toEqual({ value: 1 });

      const newState = StoreState.create({
        slices: [sliceA],
      });

      expect(derivedSelectorA.get(newState)).toEqual(initialDerivedValue);
      expect(derivedSelectorA.get(newState)).not.toBe(initialDerivedValue);
      expect(callCount).toBe(2);
    });

    test('should recognize when equality check returns false', () => {
      const sliceKeyA = createKey('mySliceA', []);
      const fieldA = sliceKeyA.field(1);
      const sliceA = sliceKeyA.slice({ fields: {} });
      const initialState = StoreState.create({
        slices: [sliceA],
      });
      let callCount = 0;

      const derivedSelectorA = sliceKeyA.derive(
        (state) => {
          callCount++;
          return { value: fieldA.get(state) };
        },
        {
          equal: (prev, next) => prev.value !== next.value,
        },
      );

      expect(derivedSelectorA.get(initialState)).toEqual({ value: 1 });

      const newState = StoreState.create({
        slices: [sliceA],
      });

      expect(derivedSelectorA.get(newState)).toEqual(
        derivedSelectorA.get(initialState),
      );
      expect(derivedSelectorA.get(newState)).not.toBe(
        derivedSelectorA.get(initialState),
      );
      expect(callCount).toBe(2);
    });
  });
  test('selector with no state field', () => {
    const mySliceKeyA = createKey('mySliceA', []);

    const selectorA = mySliceKeyA.derive((storeState) => {
      return {};
    });

    const mySliceA = mySliceKeyA.slice({
      fields: {
        selectorA,
      },
    });

    const storeState = StoreState.create({
      slices: [mySliceA],
    });

    expect(mySliceA.get(storeState).selectorA).toEqual({});
  });

  describe('slice with multiple dependencies', () => {
    const mySliceKeyA = createKey('mySliceA', []);
    const aField = mySliceKeyA.field(2);

    let calledTimesA = 0;
    let calledTimesB = 0;
    let calledTimesC = 0;

    const selectorA = mySliceKeyA.derive(
      (storeState) => {
        calledTimesA++;
        return { selA: aField.get(storeState) };
      },
      {
        equal: (a, b) => {
          return shallowEqual(a, b);
        },
      },
    );

    const mySliceA = mySliceKeyA.slice({
      fields: {
        a: aField,
        selectorA,
      },
    });

    const mySliceKeyB = createKey('mySliceB', [mySliceA]);
    const bField = mySliceKeyB.field(5);
    const selectorB = mySliceKeyB.derive((storeState) => {
      calledTimesB++;
      return {
        selB: bField.get(storeState) + aField.get(storeState),
      };
    });
    const mySliceB = mySliceKeyB.slice({
      fields: {
        b: bField,
        selectorB,
      },
    });

    const mySliceKeyC = createKey('mySliceC', [mySliceA, mySliceB]);
    const cField = mySliceKeyC.field(10);

    const selectorC = mySliceKeyC.derive((storeState) => {
      calledTimesC++;
      return {
        selCA: mySliceA.get(storeState).a,
        selCB: mySliceB.get(storeState).b,
        selCSelB: mySliceB.get(storeState).selectorB.selB,
        selC: cField.get(storeState),
      };
    });
    const mySliceC = mySliceKeyC.slice({
      fields: {
        selectorC,
      },
    });

    let incrementA: () => Transaction<'mySliceA', never>;
    let incrementB: () => Transaction<'mySliceB', 'mySliceA'>;
    let incrementC: () => Transaction<'mySliceC', 'mySliceB' | 'mySliceA'>;

    beforeEach(() => {
      calledTimesA = 0;
      calledTimesB = 0;
      calledTimesC = 0;

      incrementA = () => {
        const txn = mySliceKeyA.transaction();

        return txn.step((storeState) => {
          return storeState.apply(aField.update((a) => a + 1));
        });
      };

      incrementB = () => {
        return bField.update((b) => b + 1);
      };

      incrementC = () => {
        return cField.update((c) => c + 1);
      };
    });

    test('single A increment', () => {
      const storeState = StoreState.create({
        slices: [mySliceA, mySliceB, mySliceC],
      });
      const storeState2 = storeState.apply(incrementA());
      expect({
        sliceA: mySliceA.get(storeState2),
        sliceB: mySliceB.get(storeState2),
        sliceC: mySliceC.get(storeState2),
      }).toEqual({
        sliceA: {
          a: 3,
          selectorA: {
            selA: 3,
          },
        },
        sliceB: {
          b: 5,
          selectorB: {
            selB: 8,
          },
        },
        sliceC: {
          selectorC: {
            selC: 10,
            selCB: 5,
            selCA: 3,
            selCSelB: 8,
          },
        },
      });

      // calling again should not call selector
      mySliceA.get(storeState2);
      mySliceB.get(storeState2);
      mySliceC.get(storeState2);

      expect(calledTimesA).toBe(1);
      expect(calledTimesB).toBe(1);
      expect(calledTimesC).toBe(1);
    });

    test('increment multiple should only call selector once', () => {
      const storeState = StoreState.create({
        slices: [mySliceA, mySliceB, mySliceC],
      });

      const storeState2 = storeState.apply(incrementA());

      let sliceAVal = mySliceA.get(storeState2).selectorA;
      expect(calledTimesA).toBe(1);

      mySliceB.get(storeState2);
      mySliceC.get(storeState2);

      expect(calledTimesA).toBe(1);

      let storeState3 = storeState2.apply(incrementC());

      expect(calledTimesA).toBe(1);

      expect(mySliceC.get(storeState3).selectorC).toMatchInlineSnapshot(`
          {
            "selC": 11,
            "selCA": 3,
            "selCB": 5,
            "selCSelB": 8,
          }
        `);
    });
  });
});
