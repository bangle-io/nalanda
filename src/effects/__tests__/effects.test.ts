import { changeEffect, onceEffect, syncOnceEffect } from '../index';
import { createKey, slice } from '../../vanilla/create';
import { timeoutSchedular } from '../../vanilla/effect';
import { Store } from '../../vanilla/store';
import waitForExpect from 'wait-for-expect';
import { expectType, rejectAny } from '../../vanilla/internal-types';
waitForExpect.defaults.timeout = 600;
waitForExpect.defaults.interval = 30;

function sleep(t = 20): Promise<void> {
  return new Promise((res) => setTimeout(res, t));
}

const testSlice1 = slice({
  key: createKey(
    'test-1',
    [],
    { num: 4 },
    {
      numSq: (state) => state.num * state.num,
    },
  ),
  actions: {
    increment: (opts: { increment: boolean }) => (state) => {
      return { ...state, num: state.num + (opts.increment ? 1 : 0) };
    },
    decrement: (opts: { decrement: boolean }) => (state) => {
      return { ...state, num: state.num - (opts.decrement ? 1 : 0) };
    },
  },
});

const testSlice2 = slice({
  key: createKey('test-2', [], { name: 'tame', age: 4 }),
  actions: {
    prefix: (prefix: string) => (state) => {
      return { ...state, name: prefix + state.name };
    },
    padEnd: (length: number, pad: string) => (state) => {
      return { ...state, name: state.name.padEnd(length, pad) };
    },
    uppercase: () => (state) => {
      return { ...state, name: state.name.toUpperCase() };
    },
    age: (age: number) => (state) => {
      return { ...state, age: state.age + age };
    },
  },
});

const testSlice3 = slice({
  key: createKey('test-3', [], { name: 'TAME' }),
  actions: {
    lowercase: () => (state) => {
      return { ...state, name: state.name.toLocaleLowerCase() };
    },
    uppercase: () => (state) => {
      return { ...state, name: state.name.toLocaleUpperCase() };
    },
  },
});

describe('onceEffect', () => {
  test('works', async () => {
    let called = jest.fn();
    const once = onceEffect(
      [testSlice1, testSlice3],
      'run-once',
      (state, dispatch) => {
        called({
          testSlice1: testSlice1.getState(state),
          testSlice3: testSlice3.getState(state),
        });

        dispatch(testSlice3.actions.lowercase());

        //   @ts-expect-error - test slice 2 is not a dep
        testSlice2.getState(state);

        testSlice1.getState(state);
      },
    );

    // @ts-expect-error should not expose any actions externally
    once.actions.xyz?.();

    expectType<Record<string, never>>(once.actions);

    const store = Store.create({
      storeName: 'test-store',
      scheduler: timeoutSchedular(0),
      state: [testSlice1, testSlice2, testSlice3, once],
    });

    expect(testSlice3.getState(store.state).name).toEqual('TAME');

    store.dispatch(testSlice1.actions.increment({ increment: true }));

    await sleep(10);
    expect(called).toHaveBeenCalledTimes(1);

    expect(testSlice3.getState(store.state).name).toEqual('tame');

    store.dispatch(testSlice1.actions.increment({ increment: true }));
    store.dispatch(testSlice1.actions.increment({ increment: true }));
    store.dispatch(testSlice1.actions.increment({ increment: true }));

    await sleep(10);
    expect(called).toHaveBeenCalledTimes(1);
    await sleep(10);
    expect(called).toHaveBeenCalledTimes(1);
  });
});

describe('syncOnceEffect', () => {
  test('works', async () => {
    let called = jest.fn();
    const once = syncOnceEffect(
      [testSlice1, testSlice3],
      'run-sync-once',
      (state, dispatch) => {
        called({
          testSlice1: testSlice1.getState(state),
          testSlice3: testSlice3.getState(state),
        });

        dispatch(testSlice3.actions.lowercase());

        //   @ts-expect-error - test slice 2 is not a dep
        testSlice2.getState(state);

        testSlice1.getState(state);
      },
    );

    // @ts-expect-error should not expose any actions externally
    once.actions.xyz?.();

    expectType<Record<string, never>>(once.actions);

    const store = Store.create({
      storeName: 'test-store',
      scheduler: timeoutSchedular(0),
      state: [testSlice1, testSlice2, testSlice3, once],
    });
    expect(testSlice3.getState(store.state).name).toEqual('TAME');
    store.dispatch(testSlice1.actions.increment({ increment: true }));

    // because sync effect execution is queued to a microtask we need to await on promise
    await Promise.resolve();
    expect(called).toHaveBeenCalledTimes(1);
    expect(testSlice3.getState(store.state).name).toEqual('tame');

    store.dispatch(testSlice1.actions.increment({ increment: true }));
    store.dispatch(testSlice1.actions.increment({ increment: true }));
    store.dispatch(testSlice1.actions.increment({ increment: true }));

    await Promise.resolve();
    expect(called).toHaveBeenCalledTimes(1);
    await Promise.resolve();
    await Promise.resolve();
    expect(called).toHaveBeenCalledTimes(1);
  });
});

describe('changeEffect', () => {
  test('types', async () => {
    let fn = jest.fn();
    const myEffect = changeEffect(
      'myEffect',
      {
        numnum: testSlice1.pick((state) => state.num),
        foofoo: testSlice2.pick((state) => state.name),
      },
      (result, dispatch, ref) => {
        if (!ref) {
          throw new Error('ref should be defined');
        }

        fn(result.numnum);
        rejectAny(result);

        expectType<number>(result.numnum);
        expectType<string>(result.foofoo);

        // just to test types
        () => {
          let wrongAction = testSlice3.actions.lowercase();
          // @ts-expect-error - should not allow dispatching action from non dep slice
          dispatch(wrongAction);

          dispatch(testSlice2.actions.padEnd(2, ' '));
        };

        if (result.numnum % 2 === 0) {
          dispatch(testSlice1.actions.increment({ increment: true }));
        }
      },
    );

    const store = Store.create({
      storeName: 'test-store',
      scheduler: timeoutSchedular(0),
      state: [testSlice1, testSlice2, testSlice3, myEffect],
    });

    await waitForExpect(() => {
      expect(fn).toBeCalledTimes(2);
    });
    expect(fn).nthCalledWith(1, 4);
    // second update is thanks to myEffect
    expect(fn).nthCalledWith(2, 5);
  });
  test('works', async () => {
    let call = jest.fn();

    const myEffect = changeEffect(
      'myEffect',
      {
        sl1Num: testSlice1.pick((state) => state.num),
        sl2Name: testSlice2.pick((state) => state.name),
        sl1Square: testSlice1.pick((state) => state.numSq),
      },
      (result, dispatch, ref) => {
        if (!ref) {
          throw new Error('ref should be defined');
        }
        call(result);
        // @ts-expect-error - should not be able to invalid keys
        result.xyz?.();
        expectType<number>(result.sl1Num);
        expectType<string>(result.sl2Name);
        expectType<number>(result.sl1Square);

        let wrongAction = testSlice3.actions.lowercase();
        // @ts-expect-error - should not allow dispatching action from non dep slice
        dispatch(wrongAction);

        if (result.sl1Square % 2 === 0) {
          dispatch(testSlice1.actions.increment({ increment: true }));
        }
      },
    );

    const store = Store.create({
      storeName: 'test-store',
      scheduler: timeoutSchedular(0),
      state: [testSlice1, testSlice2, testSlice3, myEffect],
    });

    await sleep(30);

    expect(call).toHaveBeenCalledTimes(2);
  });

  test('cleanup is called', async () => {
    let call: string[] = [];
    let counter = 0;
    const myEffect = changeEffect(
      'myEffect',
      {
        sl1Num: testSlice1.pick((state) => state.num),
        sl2Name: testSlice2.pick((state) => state.name),
        sl1Square: testSlice1.pick((state) => state.numSq),
      },
      (result, dispatch) => {
        let count = counter++;
        call.push('run' + count);

        return () => {
          call.push('cleanup' + count);
        };
      },
    );

    const store = Store.create({
      storeName: 'test-store',
      scheduler: timeoutSchedular(0),
      state: [testSlice1, testSlice2, testSlice3, myEffect],
    });

    await waitForExpect(() => {
      expect(call).toEqual(['run0']);
    });

    store.dispatch(testSlice1.actions.increment({ increment: true }));

    await waitForExpect(() => {
      expect(call).toEqual(['run0', 'cleanup0', 'run1']);
    });

    // should still call cleanup only once
    store.dispatch(testSlice1.actions.increment({ increment: true }));
    store.dispatch(testSlice1.actions.increment({ increment: true }));
    store.dispatch(testSlice1.actions.increment({ increment: true }));

    await waitForExpect(() => {
      expect(call).toEqual(['run0', 'cleanup0', 'run1', 'cleanup1', 'run2']);
    });

    store.destroy();

    await waitForExpect(() => {
      expect(call).toEqual([
        'run0',
        'cleanup0',
        'run1',
        'cleanup1',
        'run2',
        'cleanup2',
      ]);
    });
  });
});

describe('only updates when deps change', () => {
  let effectCallSpy = jest.fn();
  beforeEach(() => {
    effectCallSpy = jest.fn();
  });
  const watchTestSlice2Age = changeEffect(
    'myEffect',
    {
      age: testSlice2.pick((state) => state.age),
    },
    (result, dispatch) => {
      effectCallSpy(result.age);
      rejectAny(result);

      expectType<number>(result.age);
    },
  );

  test('called once on mount', async () => {
    const store = Store.create({
      storeName: 'test-store',
      scheduler: timeoutSchedular(0),
      state: [testSlice1, testSlice2, testSlice3, watchTestSlice2Age],
    });

    await sleep(5);
    expect(effectCallSpy).toBeCalledTimes(1);
    expect(effectCallSpy).nthCalledWith(1, 4);
  });

  test('called once even if immediately dispatched', async () => {
    const store = Store.create({
      storeName: 'test-store',
      scheduler: timeoutSchedular(0),
      state: [testSlice1, testSlice2, testSlice3, watchTestSlice2Age],
    });

    store.dispatch(testSlice2.actions.age(1));

    await sleep(5);
    expect(effectCallSpy).toBeCalledTimes(1);
    expect(effectCallSpy).nthCalledWith(1, 5); // 5 because of the dispatch
  });

  test('is not called for irrelevant changes in the slice', async () => {
    const store = Store.create({
      storeName: 'test-store',
      scheduler: timeoutSchedular(0),
      state: [testSlice1, testSlice2, testSlice3, watchTestSlice2Age],
    });

    await sleep(5);
    expect(effectCallSpy).toBeCalledTimes(1);

    store.dispatch(testSlice2.actions.prefix('dad'));

    await sleep(5);
    expect(effectCallSpy).toBeCalledTimes(1);
    expect(testSlice2.getState(store.state)).toMatchInlineSnapshot(`
        {
          "age": 4,
          "name": "dadtame",
        }
      `);
  });

  test('is called once if data does not change', async () => {
    const store = Store.create({
      storeName: 'test-store',
      scheduler: timeoutSchedular(0),
      state: [testSlice1, testSlice2, testSlice3, watchTestSlice2Age],
    });

    await waitForExpect(() => {
      expect(effectCallSpy).toBeCalledTimes(1);
    });

    store.dispatch(testSlice2.actions.age(0));

    await sleep(15);
    expect(effectCallSpy).toBeCalledTimes(1);
  });

  test('is called only once for multiple sync dispatches', async () => {
    const store = Store.create({
      storeName: 'test-store',
      scheduler: timeoutSchedular(0),
      state: [testSlice1, testSlice2, testSlice3, watchTestSlice2Age],
    });

    await waitForExpect(() => {
      expect(effectCallSpy).toBeCalledTimes(1);
    });

    for (const age of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) {
      store.dispatch(testSlice2.actions.age(age));
    }

    await waitForExpect(() => {
      // should only be called two times,
      // once on mount and once after all the dispatches
      expect(effectCallSpy).toBeCalledTimes(2);
    });

    expect(effectCallSpy).nthCalledWith(1, 4);
    // n*(n+1)/2 is the sum of all numbers from 1 to n
    expect(effectCallSpy).nthCalledWith(2, 4 + (10 * (10 + 1)) / 2);
  });
});
