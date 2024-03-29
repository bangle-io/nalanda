import {
  expect,
  jest,
  test,
  describe,
  beforeEach,
  afterEach,
} from '@jest/globals';
import { testCleanup } from '../../helpers/test-cleanup';
import { createKey } from '../key';
import { createStore } from '../../store';
import { Slice } from '../slice';
import { StoreState } from '../../store-state';
import { Transaction } from '../../transaction';
import { expectType } from '../../types';

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

describe('internal fields', () => {
  test('internal field should be updated', () => {
    const key = createKey('mySliceName', []);
    const counter = key.field(0);
    const counterSlice = key.slice({});

    function updateCounter(state: number) {
      return counter.update(state + 1);
    }

    const store = createStore({
      autoStartEffects: true,
      slices: [counterSlice],
    });

    expect(counter.get(store.state)).toBe(0);
    expect(Object.keys(counterSlice.get(store.state))).toEqual([]);
  });

  describe('mix of internal and external fields', () => {
    const setup = () => {
      const key = createKey('mySliceName', []);
      const counter = key.field(0);
      const myName = key.field('kj');
      const callCount = {
        externalDerivedOnCounter: 0,
        internalDerivedOnCounter: 0,
      };

      const externalDerivedOnCounter = key.derive((state) => {
        callCount.externalDerivedOnCounter++;
        return `external:counter is ${counter.get(state)}`;
      });

      const internalDerivedOnCounter = key.derive((state) => {
        callCount.internalDerivedOnCounter++;
        return `internal:counter is ${counter.get(state)}`;
      });

      const counterSlice = key.slice({
        myName,
        externalDerivedOnCounter,
      });

      function updateCounter() {
        return counter.update((existing) => existing + 1);
      }

      function updateName(name: string) {
        return myName.update(name + '!');
      }

      return {
        counter,
        counterSlice,
        updateCounter,
        updateName,
        callCount,
        internalDerivedOnCounter,
      };
    };

    test('access external fields', () => {
      const { counterSlice, counter, callCount } = setup();
      const store = createStore({
        autoStartEffects: true,
        slices: [counterSlice],
      });

      expect(counter.get(store.state)).toBe(0);

      const result = counterSlice.get(store.state);
      expect('myName' in result).toBe(true);
      expect('counter' in result).toBe(false);
      expect({ ...result }).toEqual({
        externalDerivedOnCounter: 'external:counter is 0',
        myName: 'kj',
      });
      expect(Object.keys(result)).toEqual([
        'myName',
        'externalDerivedOnCounter',
      ]);

      expect(callCount).toEqual({
        externalDerivedOnCounter: 1,
        internalDerivedOnCounter: 0,
      });
    });

    test('updating', () => {
      const { counterSlice, counter, callCount, updateCounter } = setup();

      const store = createStore({
        autoStartEffects: true,
        slices: [counterSlice],
      });

      store.dispatch(updateCounter());
      expect(counter.get(store.state)).toBe(1);
      let result = counterSlice.get(store.state);

      expect(result.externalDerivedOnCounter).toBe('external:counter is 1');
      //   to test proxy
      result.externalDerivedOnCounter;
      result.externalDerivedOnCounter;
      expect(callCount.externalDerivedOnCounter).toEqual(1);

      store.dispatch(updateCounter());
      expect(counter.get(store.state)).toBe(2);
      result = counterSlice.get(store.state);
      expect(result.externalDerivedOnCounter).toBe('external:counter is 2');
      //   to test proxy
      result.externalDerivedOnCounter;
      expect(callCount.externalDerivedOnCounter).toEqual(2);
    });

    test('derived is lazy', () => {
      const { counterSlice, counter, callCount, updateCounter } = setup();

      const store = createStore({
        autoStartEffects: true,
        slices: [counterSlice],
      });

      store.dispatch(updateCounter());
      expect(counter.get(store.state)).toBe(1);
      let result = counterSlice.get(store.state);

      //   accessing some other field should not trigger the derived
      expect(result.myName).toBe('kj');
      expect(callCount.externalDerivedOnCounter).toEqual(0);
      //   access the derived field
      result.externalDerivedOnCounter;
      expect(callCount.externalDerivedOnCounter).toEqual(1);

      expect(counterSlice.get(store.state)).toBe(result);
    });
  });

  test('update', () => {
    const mySliceKey = createKey('mySlice', []);
    const aField = mySliceKey.field(1);
    const mySlice = mySliceKey.slice({
      a: aField,
    });

    const mySlice2Key = createKey('mySlice2', [mySlice]);
    const aField2 = mySlice2Key.field(1);
    const mySlice2 = mySlice2Key.slice({
      a: aField2,
    });

    // type checks
    () => {
      let storeState: GetStoreStateFromSliceName<typeof mySlice> = {} as any;
      let result = aField.update(2);

      expectType<Transaction<'mySlice', never>, typeof result>(result);
    };

    () => {
      let storeState: GetStoreStateFromSliceName<typeof mySlice2> = {} as any;
      let result = aField.update(3);
      // TODO make this fail as mySlice is not in store
      storeState.apply(result);
    };

    () => {
      let storeState: GetStoreStateFromSliceName<typeof mySlice> = {} as any;
      //   @ts-expect-error invalid type
      let result = aField.update(false);
    };

    () => {
      let storeState: GetStoreStateFromSliceName<typeof mySlice> = {} as any;

      let result = aField.update((existing) => {
        expectType<number, typeof existing>(existing);

        return 2;
      });
    };
  });
});
