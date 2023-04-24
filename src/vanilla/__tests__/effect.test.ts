import { createSlice } from '../create';
import { EffectHandler, timeoutSchedular } from '../effect';
import { Store } from '../store';
import waitForExpect from 'wait-for-expect';
import { Slice, UnknownSlice } from '../slice';
waitForExpect.defaults.timeout = 600;
waitForExpect.defaults.interval = 30;

const testSlice1 = createSlice([], {
  initState: {
    num: 4,
  },
  name: 'test-1',
  actions: {
    increment: (opts: { increment: boolean }) => (state) => {
      return { ...state, num: state.num + (opts.increment ? 1 : 0) };
    },
    decrement: (opts: { decrement: boolean }) => (state) => {
      return { ...state, num: state.num - (opts.decrement ? 1 : 0) };
    },
  },
});

const testSlice2 = createSlice([], {
  name: 'test-2',
  initState: {
    name: 'tame',
  },
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
  },
});

const testSlice3 = createSlice([], {
  name: 'test-3',
  initState: {
    name: 'tame',
  },
  actions: {
    lowercase: () => (state) => {
      return { ...state, name: state.name.toLocaleLowerCase() };
    },
  },
});

test('EffectHandler works', () => {
  const store = Store.create({
    storeName: 'test-store',
    scheduler: timeoutSchedular(0),
    state: [testSlice1],
  }) as Store;

  const effect = new EffectHandler(
    {
      updateSync: () => {},
    },
    store.state,
    testSlice1 as UnknownSlice,
  );
});

describe('init and destroy ', () => {
  test('init and destroy are called', async () => {
    const init = jest.fn();
    const onDestroy = jest.fn();
    const mySlice = createSlice([testSlice1], {
      name: 'mySlice',
      initState: {
        name: 'tame',
      },
      actions: {},
      freeze: false,
    });

    Slice._registerEffect(mySlice, {
      init,
      destroy: onDestroy,
    });

    const store = Store.create({
      storeName: 'test-store',
      state: [testSlice1, mySlice],
    });

    // is not called immediately
    expect(init).toBeCalledTimes(0);

    await waitForExpect(() => {
      expect(init).toBeCalledTimes(1);
    });

    store.destroy();

    expect(onDestroy).toBeCalledTimes(1);
  });

  test('calls init before update', async () => {
    let order: string[] = [];
    const init = jest.fn(() => {
      order.push('init');
    });
    const update = jest.fn(() => {
      order.push('update');
    });
    const updateSync = jest.fn(() => {
      order.push('updateSync');
    });
    const onDestroy = jest.fn(() => {
      order.push('destroy');
    });

    const mySlice = createSlice([testSlice1], {
      name: 'myslice',
      initState: {
        name: 'tame',
      },
      actions: {
        lowercase: () => (state) => {
          return { ...state, name: state.name.toLocaleLowerCase() };
        },
      },
      freeze: false,
    });

    Slice._registerEffect(mySlice, {
      init,
      update: update,
      updateSync,
      destroy: onDestroy,
    });

    const store = Store.create({
      storeName: 'test-store',
      scheduler: timeoutSchedular(0),
      state: [testSlice1, mySlice],
    });
    store.dispatch(mySlice.actions.lowercase());
    // is not called immediately
    expect(init).toBeCalledTimes(0);

    await waitForExpect(() => {
      expect(init).toBeCalledTimes(1);
    });

    await waitForExpect(() => {
      expect(order).toEqual(['init', 'updateSync', 'update']);
    });

    store.destroy();

    expect(order).toEqual(['init', 'updateSync', 'update', 'destroy']);
  });
});

test('EffectHandler with deps', () => {
  const mySlice = createSlice([testSlice1, testSlice2], {
    name: 'myslice',
    initState: {
      name: 'tame',
    },
    actions: {
      lowercase: () => (state) => {
        return { ...state, name: state.name.toLocaleLowerCase() };
      },
    },
  });

  const store = Store.create({
    storeName: 'test-store',
    state: [testSlice1, testSlice2, mySlice],
  }) as Store;

  const effect = new EffectHandler(
    {
      updateSync: () => {},
    },
    store.state,
    mySlice as UnknownSlice,
  );

  expect(effect.lineageId).toBe(mySlice.spec.lineageId);
});
