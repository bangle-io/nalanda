import {
  expect,
  jest,
  test,
  describe,
  beforeEach,
  afterEach,
} from '@jest/globals';
import { testCleanup } from '../helpers/test-cleanup';
import { createKey } from '../index';
import { StoreState } from '../store-state';

const sliceOneKey = createKey('sliceOne', []);
const keyOne = sliceOneKey.field('valueOne');

const sliceOne = sliceOneKey.slice({
  keyOne,
});

const sliceTwoKey = createKey('sliceTwo', []);
const keyTwo = sliceTwoKey.field('valueTwo');

const sliceTwo = sliceTwoKey.slice({
  keyTwo,
});

const updateKeyOneSliceOne = (val: string) => {
  return keyOne.update(val);
};

const updateKeyTwoSliceTwo = (val: string) => {
  return keyTwo.update(val);
};

beforeEach(() => {
  testCleanup();
});

describe('StoreState Slice and Transaction Operations', () => {
  test('correctly applies a single transaction', () => {
    let storeState = StoreState.create({
      slices: [sliceOne, sliceTwo],
    });

    const transaction = updateKeyOneSliceOne('updatedValueOne');

    storeState = storeState.apply(transaction);

    expect(sliceOne.get(storeState)).toMatchInlineSnapshot(`
        {
          "keyOne": "updatedValueOne",
        }
      `);
    expect(sliceTwo.get(storeState)).toMatchInlineSnapshot(`
        {
          "keyTwo": "valueTwo",
        }
      `);
  });

  test('correctly applies multiple transactions and throws error when applying the same transaction again', () => {
    let storeState = StoreState.create({
      slices: [sliceOne, sliceTwo],
    });

    const firstTransaction = updateKeyOneSliceOne('updatedValueOne');
    const secondTransaction = updateKeyTwoSliceTwo('updatedValueTwo');

    // Apply multiple transactions to the store and verify state updates
    storeState = storeState.apply(
      firstTransaction.step((state) => {
        return state.apply(secondTransaction);
      }),
    );

    expect(sliceOne.get(storeState)).toEqual({
      keyOne: 'updatedValueOne',
    });
    expect(sliceTwo.get(storeState)).toEqual({
      keyTwo: 'updatedValueTwo',
    });

    // Try applying the same transactions again and verify that an error is thrown
    expect(() =>
      storeState.apply(firstTransaction),
    ).toThrowErrorMatchingInlineSnapshot(
      `"Transaction "tx_0" has already been applied."`,
    );

    expect(() =>
      storeState.apply(secondTransaction),
    ).toThrowErrorMatchingInlineSnapshot(
      `"Transaction "tx_1" has already been applied."`,
    );
  });

  test('storeState remains the same if action step does not mutate state', () => {
    const immutableSliceKey = createKey('immutableSlice', []);
    const fixedState = { fixed: 'state' };
    const immutableField = immutableSliceKey.field(fixedState);

    const immutableSlice = immutableSliceKey.slice({
      immutableField: immutableField,
    });

    function nonMutatingAction(inputNumber: number) {
      return immutableField.update(() => fixedState);
    }

    let storeState = StoreState.create({
      slices: [sliceOne, immutableSlice],
    });

    let newStoreStateAfterActionOne = storeState.apply(nonMutatingAction(3));

    expect(newStoreStateAfterActionOne).toBe(storeState);

    let newStoreStateAfterActionTwo = newStoreStateAfterActionOne.apply(
      updateKeyOneSliceOne('updatedValueOne').step((state) => {
        return state.apply(nonMutatingAction(3));
      }),
    );

    expect(immutableSlice.get(newStoreStateAfterActionTwo).immutableField).toBe(
      fixedState,
    );
  });

  test('step is called with the same instance of storeState if no mutation occurred in previous step', () => {
    const mySliceKey = createKey('mySlice', []);
    const fixedState = { fixed: 'state' };
    const myField = mySliceKey.field(fixedState);

    const mySlice = mySliceKey.slice({
      myField: myField,
    });

    function nonMutatingAction(inputNumber: number) {
      return myField.update(fixedState);
    }

    let storeStateInstances: StoreState<any>[] = [];

    function mutatingAction(inputNumber: number) {
      const transaction = mySliceKey.transaction();

      return transaction.step((state) => {
        storeStateInstances.push(state);
        return state.apply(myField.update({ fixed: 'new-state' }));
      });
    }

    let store = StoreState.create({
      slices: [sliceOne, mySlice],
    });

    let newStoreStateAfterMutatingAction = store.apply(
      nonMutatingAction(3).step((state) => state.apply(mutatingAction(53))),
    );

    expect(storeStateInstances.length).toBe(1);
    expect(storeStateInstances[0]).toBe(store);

    expect(newStoreStateAfterMutatingAction).not.toBe(store);
  });

  test('state from previous step is correctly passed to next step', () => {
    const sliceAKey = createKey('sliceA', []);
    const counterA = sliceAKey.field(1);

    const sliceA = sliceAKey.slice({
      counter: counterA,
    });

    const sliceBKey = createKey('sliceB', [sliceA]);
    const counterB = sliceBKey.field(1);

    const sliceB = sliceBKey.slice({
      counter: counterB,
    });

    function actionIncrementCounterA() {
      return counterA.update((existing) => existing + 1);
    }

    function actionIncrementCounterB() {
      const txn = sliceBKey.transaction();
      return txn.step((state) => {
        return state.apply(
          counterB.update(
            () => sliceA.get(state).counter + sliceB.get(store).counter + 1,
          ),
        );
      });
    }

    let store = StoreState.create({
      slices: [sliceA, sliceB],
    });

    let newStore = store.apply(
      actionIncrementCounterA().step((state) =>
        state.apply(actionIncrementCounterB()),
      ),
    );

    expect({
      a: sliceA.get(newStore),
      b: sliceB.get(newStore),
    }).toEqual({
      a: {
        counter: 2,
      },
      b: {
        counter: 4,
      },
    });

    // previous state should not be changed
    expect({
      a: sliceA.get(store),
      b: sliceB.get(store),
    }).toEqual({
      a: {
        counter: 1,
      },
      b: {
        counter: 1,
      },
    });
  });

  test('correctly overrides state', () => {
    let store = StoreState.create({
      slices: [sliceOne, sliceTwo],
      stateOverride: {
        [sliceOne.sliceId]: {
          keyOne: 'newValueOne',
        },
      },
    });

    expect(sliceOne.get(store)).toEqual({
      keyOne: 'newValueOne',
    });

    expect(sliceTwo.get(store)).toEqual({
      keyTwo: 'valueTwo',
    });
  });
});

describe('_getChangedSlices', () => {
  test('returns an empty array when no transactions have been applied', () => {
    let storeState = StoreState.create({
      slices: [],
    });

    const changedSlices = storeState._getChangedSlices(
      StoreState.create({
        slices: [],
      }),
    );

    expect(changedSlices).toEqual([]);
  });

  test('should return changed slices', () => {
    let storeState1 = StoreState.create({
      slices: [sliceOne, sliceTwo],
    });

    let storeState2 = StoreState.create({
      slices: [sliceOne, sliceTwo],
    });

    // Apply transaction to the second store state
    const transaction = updateKeyTwoSliceTwo('updatedValueTwo');
    storeState2 = storeState2.apply(transaction);

    const changedSlices = storeState1._getChangedSlices(storeState2);

    // Only sliceTwo should have changed
    expect(changedSlices.length).toBe(1);
    expect(changedSlices[0]!.sliceId).toBe('sl_sliceTwo$');
  });

  test('should return empty array when no slices have changed', () => {
    let storeState1 = StoreState.create({
      slices: [sliceOne, sliceTwo],
    });

    let storeState2 = StoreState.create({
      slices: [sliceOne, sliceTwo],
    });

    const changedSlices = storeState1._getChangedSlices(storeState2);

    expect(changedSlices.length).toBe(0);
  });

  test('should return all slices when all slices have changed', () => {
    let initialStoreState = StoreState.create({
      slices: [sliceOne, sliceTwo],
    });

    // Apply transactions to the second store state
    const transactionOne = updateKeyOneSliceOne('updatedValueOne');
    const transactionTwo = updateKeyTwoSliceTwo('updatedValueTwo');
    let storeState = initialStoreState.apply(transactionOne);
    storeState = storeState.apply(transactionTwo);

    expect(storeState._getChangedSlices(initialStoreState)).toHaveLength(2);
    expect(initialStoreState._getChangedSlices(storeState)).toHaveLength(2);
  });
});
