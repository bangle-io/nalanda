import { beforeEach, describe, expect, it, test } from '@jest/globals';
import { createKey } from '../key';
import { IfEquals, expectType } from '../../types';
import { InferDepNameFromSlice, Slice } from '../slice';
import { StateField } from '../field';
import { testCleanup } from '../../helpers/test-cleanup';
import { StoreState } from '../../store-state';
import { Transaction } from '../../transaction';
import { EffectStore } from '../../effect/effect-store';

beforeEach(() => {
  testCleanup();
});

type GetStoreStateFromSliceName<TSlice extends Slice> = TSlice extends Slice<
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

    function incrementAField(fakeInput: number) {
      return aField.update((a) => a + 1);
    }

    function decrementAField(fakeInput: string) {
      return aField.update((a) => a - 1);
    }

    const mySlice = mySliceKey.slice({
      a: aField,
      incrementAField,
      decrementAField,
    });

    const mySlice2Key = createKey('mySlice2', [mySlice]);
    const aField2 = mySlice2Key.field(1);
    const mySlice2 = mySlice2Key.slice({
      a: aField2,
    });

    describe('dependencies', () => {
      it('should have correct types', () => {
        expect(mySlice).toBeInstanceOf(Slice);

        mySlice satisfies Slice<{ a: StateField<number> }, 'mySlice', never>;

        type DepName = InferDepNameFromSlice<typeof mySlice>;
        type Match = IfEquals<never, DepName, true, false>;
        let result: Match = true;
      });

      it('should have correct types with dependencies', () => {
        type DepName = InferDepNameFromSlice<typeof mySlice2>;
        type Match = IfEquals<'mySlice', DepName, true, false>;
        let result: Match = true as const;

        mySlice2 satisfies Slice<
          { a: StateField<number> },
          'mySlice2',
          'mySlice'
        >;
      });
    });

    describe('actions', () => {
      test('actions work', () => {
        expect(mySlice.incrementAField).toBeDefined();
        expect(mySlice.decrementAField).toBeDefined();

        expect(mySlice.actions.decrementAField).toBeDefined();
        expect(mySlice.actions.incrementAField).toBeDefined();
        expectType<
          (p: number) => Transaction<'mySlice', never>,
          typeof mySlice.incrementAField
        >(mySlice.incrementAField);

        expectType<
          (p: number) => Transaction<'mySlice', never>,
          typeof mySlice.actions.incrementAField
        >(mySlice.actions.incrementAField);

        expectType<
          (p: string) => Transaction<'mySlice', never>,
          typeof mySlice.decrementAField
        >(mySlice.decrementAField);

        expectType<
          (p: string) => Transaction<'mySlice', never>,
          typeof mySlice.actions.decrementAField
        >(mySlice.actions.decrementAField);
      });

      test('throws error if slice action overlaps with a known api', () => {
        const mySliceKey = createKey('mySlice', []);

        const fieldA = mySliceKey.field(1);

        const get = () => fieldA.update((a) => a + 1);

        expect(() => {
          mySliceKey.slice({
            fieldA,
            get,
          });
        }).toThrowError(
          /Invalid action name "get" as at it conflicts with a known property with the same name on the slice./,
        );
      });

      test('throws error if slice action overlaps with a known api', () => {
        const mySliceKey = createKey('mySlice', []);

        const fieldA = mySliceKey.field(1);

        const sliceId = () => fieldA.update((a) => a + 1);

        expect(() => {
          mySliceKey.slice({
            fieldA,
            sliceId,
          });
        }).toThrowError(
          /Invalid action name "sliceId" as at it conflicts with a known property with the same name on the slice./,
        );
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

      () => {
        let storeState: StoreState<'mySlice2' | 'mySlice'> = {} as any;
        const result = mySlice.get(storeState);
        type Keys = keyof typeof result;

        const a: Keys = 'a';

        // @ts-expect-error - expected to fail as b is not a key
        const b: Keys = 'b';
      };

      () => {
        let store: EffectStore<any> = {} as any;

        let storeState: StoreState<'mySlice2' | 'mySlice'> = {} as any;
        // @ts-expect-error - expected to fail incrementAField is an action
        mySlice.get(storeState).incrementAField;

        mySlice.track(store).a;

        // @ts-expect-error - expected to fail incrementAField is an action
        mySlice.track(store).incrementAField;

        mySlice.trackField(store, 'a');

        // @ts-expect-error - expected to fail incrementAField is an action
        mySlice.trackField(store, 'incrementAField');
      };
    });
  });
});
