import { testOnlyResetIdGeneration } from '../id_generation';
import { expectType } from '../helpers';
import { sliceKey } from '../slice-key';
import { StoreState } from '../store-state';

beforeEach(() => {
  testOnlyResetIdGeneration();
});

describe('sliceKey', () => {
  describe('types and setup', () => {
    const mySliceKeyA = sliceKey([], {
      name: 'mySliceA',
      state: {
        a: 1,
      },
    });

    const mySliceA = mySliceKeyA.slice({ derivedState: {} });

    const mySliceKeyB = sliceKey([], {
      name: 'mySliceB',
      state: {
        a: 1,
      },
    });

    const mySliceKeyC = sliceKey([mySliceA], {
      name: 'mySliceC',
      state: {
        a: 1,
      },
    });

    mySliceKeyA.selector((storeState) => {
      expectType<StoreState<'mySliceA'>, typeof storeState>(storeState);

      return storeState;
    });

    mySliceKeyC.selector(
      (storeState) => {
        //   @ts-expect-error should fail as mySliceB is a dep
        mySliceKeyB.get(storeState);

        mySliceKeyA.get(storeState);
        mySliceKeyC.get(storeState);
        mySliceA.get(storeState);

        return 5;
      },
      {
        equal(a, b) {
          expectType<number, typeof a>(a);
          expectType<number, typeof b>(b);
          return false;
        },
      },
    );
  });
});
