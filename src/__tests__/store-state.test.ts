import { slice } from '../slice/slice';
import { StoreState } from '../store-state';

describe('StoreState Slice and Transaction Operations', () => {
  const sliceOne = slice([], {
    name: 'sliceOne',
    state: {
      keyOne: 'valueOne',
    },
  });

  const sliceTwo = slice([], {
    name: 'sliceTwo',
    state: { keyTwo: 'valueTwo' },
  });

  const updateKeyOneSliceOne = sliceOne.action((keyOne: string) => {
    let transaction = sliceOne.tx((state) => {
      return sliceOne.update(state, { keyOne });
    });

    return transaction;
  });

  const updateKeyTwoSliceTwo = sliceTwo.action((keyTwo: string) => {
    return sliceTwo.tx((state) => {
      return sliceTwo.update(state, { keyTwo });
    });
  });

  test('correctly applies a single transaction', () => {
    let store = StoreState.create({
      slices: [sliceOne, sliceTwo],
    });

    const transaction = updateKeyOneSliceOne('updatedValueOne');

    store = store.applyTransaction(transaction);

    expect(sliceOne.get(store)).toMatchInlineSnapshot(`
      {
        "keyOne": "updatedValueOne",
      }
    `);
    expect(sliceTwo.get(store)).toMatchInlineSnapshot(`
      {
        "keyTwo": "valueTwo",
      }
    `);
  });

  test('correctly applies multiple transactions and throws error when applying the same transaction again', () => {
    let store = StoreState.create({
      slices: [sliceOne, sliceTwo],
    });

    const firstTransaction = updateKeyOneSliceOne('updatedValueOne');
    const secondTransaction = updateKeyTwoSliceTwo('updatedValueTwo');

    // Apply multiple transactions to the store and verify state updates
    store = store.applyTransaction(firstTransaction.append(secondTransaction));

    expect(sliceOne.get(store)).toEqual({
      keyOne: 'updatedValueOne',
    });
    expect(sliceTwo.get(store)).toEqual({
      keyTwo: 'updatedValueTwo',
    });

    // Try applying the same transactions again and verify that an error is thrown
    expect(() =>
      store.applyTransaction(firstTransaction),
    ).toThrowErrorMatchingInlineSnapshot(
      `"StoreState.applyTransaction: cannot apply a destroyed transaction"`,
    );

    expect(() =>
      store.applyTransaction(secondTransaction),
    ).toThrowErrorMatchingInlineSnapshot(
      `"StoreState.applyTransaction: cannot apply a destroyed transaction"`,
    );
  });

  test('storeState remains the same if action step does not mutate state', () => {
    const fixedState = {
      keyOne: 'valueOne',
    };
    const immutableSlice = slice([], {
      name: 'immutableSlice',
      state: fixedState,
    });

    const nonMutatingAction = immutableSlice.action((inputNumber: number) => {
      return immutableSlice.tx((store) => {
        return fixedState;
      });
    });

    let store = StoreState.create({
      slices: [sliceOne, immutableSlice],
    });

    let newStoreStateAfterActionOne = store.applyTransaction(
      nonMutatingAction(3),
    );

    expect(newStoreStateAfterActionOne).toBe(store);

    let newStoreStateAfterActionTwo =
      newStoreStateAfterActionOne.applyTransaction(
        updateKeyOneSliceOne('updatedValueOne').append(nonMutatingAction(3)),
      );

    expect(immutableSlice.get(newStoreStateAfterActionTwo)).toBe(fixedState);
  });

  test('step is called with the same instance of storeState if no mutation occurred in previous step', () => {
    const fixedState = {
      keyOne: 'valueOne',
    };
    const immutableSlice = slice([], {
      name: 'immutableSlice',
      state: fixedState,
    });

    const nonMutatingAction = immutableSlice.action((inputNumber: number) => {
      return immutableSlice.tx((store) => {
        return fixedState;
      });
    });

    let storeStateInstances: StoreState<any>[] = [];
    const mutatingAction = immutableSlice.action((inputNumber: number) => {
      return immutableSlice.tx((store) => {
        storeStateInstances.push(store);
        return {
          keyOne: 'newValue',
        };
      });
    });

    let store = StoreState.create({
      slices: [sliceOne, immutableSlice],
    });

    let newStoreStateAfterMutatingAction = store.applyTransaction(
      nonMutatingAction(3).append(mutatingAction(53)),
    );

    expect(storeStateInstances.length).toBe(1);
    expect(storeStateInstances[0]).toBe(store);

    expect(newStoreStateAfterMutatingAction).not.toBe(store);
  });

  test('state from previous step is correctly passed to next step', () => {
    const sliceA = slice([], {
      name: 'sliceA',
      state: {
        counter: 1,
      },
    });

    const sliceB = slice([sliceA], {
      name: 'sliceB',
      state: {
        counter: 1,
      },
    });

    const actionIncrementCounterA = sliceA.action(() => {
      return sliceA.tx((store) => {
        return {
          counter: sliceA.get(store).counter + 1,
        };
      });
    });

    const actionIncrementCounterB = sliceB.action(() => {
      return sliceB.tx((store) => {
        return {
          counter: sliceA.get(store).counter + sliceB.get(store).counter + 1,
        };
      });
    });

    let store = StoreState.create({
      slices: [sliceA, sliceB],
    });

    let newStore = store.applyTransaction(
      actionIncrementCounterA().append(actionIncrementCounterB()),
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
