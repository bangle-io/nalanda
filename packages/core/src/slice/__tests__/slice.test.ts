import { beforeEach, describe, it, test } from '@jest/globals';
import { createKey } from '../key';
import { IfEquals, expectType } from '../../types';
import {
  AnySlice,
  InferDepNameFromSlice,
  InferSliceNameFromSlice,
  Slice,
} from '../slice';
import { StateField } from '../field';
import { testCleanup } from '../../helpers/test-cleanup';
import { StoreState } from '../../store-state';

beforeEach(() => {
  testCleanup();
});

type GetStoreStateFromSliceName<TSlice extends AnySlice> = TSlice extends Slice<
  any,
  infer TSliceName,
  any
>
  ? StoreState<TSliceName>
  : never;

describe('slice', () => {
  describe('types and setup', () => {
    const mySliceKey = createKey('mySlice', []);
    const aField = mySliceKey.field(1);
    const mySlice = mySliceKey.slice({
      fields: {
        a: aField,
      },
    });

    const mySlice2Key = createKey('mySlice2', [mySlice]);
    const aField2 = mySlice2Key.field(1);
    const mySlice2 = mySlice2Key.slice({
      fields: {
        a: aField2,
      },
    });

    describe('dependencies', () => {
      it('should have correct types', () => {
        expectType<
          Slice<{ a: StateField<number> }, 'mySlice', never>,
          typeof mySlice
        >(mySlice);

        type DepName = InferDepNameFromSlice<typeof mySlice>;
        type Match = IfEquals<never, DepName, true, false>;
        let result: Match = true;
      });

      it('should have correct types with dependencies', () => {
        type DepName = InferDepNameFromSlice<typeof mySlice2>;
        type Match = IfEquals<'mySlice', DepName, true, false>;
        let result: Match = true as const;

        expectType<
          Slice<{ a: StateField<number> }, 'mySlice2', 'mySlice'>,
          typeof mySlice2
        >(mySlice2);
      });
    });

    test('get', () => {
      // type checks
      () => {
        let storeState: GetStoreStateFromSliceName<typeof mySlice> = {} as any;
        let result = mySlice.get(storeState);
        expectType<{ a: number }, typeof result>(result);
      };

      () => {
        let storeState: GetStoreStateFromSliceName<typeof mySlice2> = {} as any;
        //   @ts-expect-error should fail as mySlice is not in store
        let result = mySlice.get(storeState);
      };

      () => {
        let storeState: StoreState<'mySlice2' | 'mySlice'> = {} as any;
        let result = mySlice.get(storeState);
      };
    });
  });
});
