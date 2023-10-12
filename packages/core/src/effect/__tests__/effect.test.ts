import {
  expect,
  jest,
  test,
  describe,
  beforeEach,
  afterEach,
} from '@jest/globals';
import { testCleanup } from '../../helpers/test-cleanup';
import waitForExpect from 'wait-for-expect';
import { createKey } from '../../slice/key';
import { StoreOptions, createStore } from '../../store';
import { cleanup } from '../cleanup';
import { EffectOpts, EffectScheduler } from '../types';
import { DEFAULT_MAX_WAIT } from '../../defaults';

beforeEach(() => {
  testCleanup();
});

const SAFE_WAIT = DEFAULT_MAX_WAIT + 5;

function sleep(t = 1): Promise<void> {
  return new Promise((res) => setTimeout(res, t));
}

const zeroTimeoutScheduler: EffectScheduler = (cb, opts) => {
  let id = setTimeout(() => void cb(), 0);

  return () => {
    clearTimeout(id);
  };
};

describe('effect with store', () => {
  const sliceAKey = createKey('sliceA', []);
  const sliceAField1 = sliceAKey.field('value:sliceAField1');
  const sliceAField2 = sliceAKey.field('value:sliceAField2');

  const sliceA = sliceAKey.slice({
    sliceAField1,
    sliceAField2,
  });

  const sliceBKey = createKey('sliceB', []);
  const sliceBField1 = sliceBKey.field('value:sliceBField1');

  const sliceB = sliceBKey.slice({
    sliceBField1,
  });

  const sliceCDepBKey = createKey('sliceCDepB', [sliceB]);
  const sliceCDepBField = sliceCDepBKey.field('value:sliceCDepBField');

  const sliceCDepBSelector1 = sliceCDepBKey.derive((state) => {
    return sliceCDepBField.get(state) + ':' + sliceB.get(state).sliceBField1;
  });

  const sliceCDepBSelector2 = sliceCDepBKey.derive((state) => {
    return sliceCDepBField.get(state) + ':selector2';
  });

  const sliceCDepB = sliceCDepBKey.slice({
    sliceCDepBField,
    sliceCDepBSelector1,
    sliceCDepBSelector2,
  });

  const setup = () => {
    function updateSliceAField1(val: string) {
      return sliceAField1.update(val);
    }

    function updateSliceAField2(val: string) {
      return sliceAField2.update(val);
    }

    function updateSliceBField1(val: string) {
      return sliceBField1.update(val);
    }

    function updateSliceCDepBField(val: string) {
      return sliceCDepBField.update(val);
    }

    const store = createStore({
      autoStartEffects: true,
      name: 'test',
      overrides: {
        effectScheduler: zeroTimeoutScheduler,
      },
      slices: [sliceA, sliceB, sliceCDepB],
    });

    return {
      store,
      sliceA,
      sliceB,
      sliceCDepB,
      updateSliceAField1,
      updateSliceAField2,
      updateSliceBField1,
      updateSliceCDepBField,
    };
  };

  test('runs effect on mount', async () => {
    const { store } = setup();

    const called = jest.fn<any>();

    store.effect(called);

    await waitForExpect(() => {
      expect(called).toHaveBeenCalledTimes(1);
    });
  });

  test('multiple dispatches trigger one effect', async () => {
    const { store, sliceA, updateSliceAField1 } = setup();

    const effectCalled = jest.fn();

    const eff = store.effect((effectStore) => {
      const { sliceAField1 } = sliceA.track(effectStore);

      effectCalled(sliceAField1);
    }, {});

    await waitForExpect(() => {
      expect(effectCalled).toHaveBeenCalledTimes(1);
    });

    expect(effectCalled).toHaveBeenLastCalledWith('value:sliceAField1');

    store.dispatch(updateSliceAField1('new-value'));
    store.dispatch(updateSliceAField1('new-value2'));
    store.dispatch(updateSliceAField1('new-value3'));

    await waitForExpect(() => {
      expect(effectCalled).toBeCalledTimes(2);
    });

    expect(effectCalled).toHaveBeenLastCalledWith('new-value3');
  });

  test('should not run effect if the field it is watching does not change', async () => {
    const { store, sliceA, updateSliceAField1 } = setup();

    let effectCalled = jest.fn();

    store.effect(function effect2(store) {
      const { sliceAField2 } = sliceA.track(store);

      effectCalled(sliceAField2);
    }, {});

    await waitForExpect(() => {
      expect(effectCalled).toHaveBeenCalledTimes(1);
    });

    expect(effectCalled).toHaveBeenLastCalledWith('value:sliceAField2');

    store.dispatch(updateSliceAField1('new-value'));

    await sleep(5);

    expect(effectCalled).toBeCalledTimes(1);
  });

  test('should run effect if the field it is watching changes', async () => {
    const { store, sliceA, updateSliceAField2 } = setup();

    let effectCalled = jest.fn();

    store.effect(function effect2(store) {
      const { sliceAField2 } = sliceA.track(store);

      effectCalled(sliceAField2);
    }, {});

    await waitForExpect(() => {
      expect(effectCalled).toHaveBeenCalledTimes(1);
    });

    expect(effectCalled).toHaveBeenLastCalledWith('value:sliceAField2');

    store.dispatch(updateSliceAField2('new-value'));

    await sleep(5);

    expect(effectCalled).toBeCalledTimes(2);
    expect(effectCalled).toHaveBeenLastCalledWith('new-value');
  });

  test('should run effect for dependent slice', async () => {
    const { store, sliceB, updateSliceBField1, sliceCDepB } = setup();

    let effect1Called = jest.fn();
    let effect2Called = jest.fn();
    let effect3Called = jest.fn();

    const selector2InitValue = 'value:sliceCDepBField:selector2';

    expect({ ...sliceCDepB.get(store.state) }).toEqual({
      sliceCDepBField: 'value:sliceCDepBField',
      sliceCDepBSelector1: 'value:sliceCDepBField:value:sliceBField1',
      sliceCDepBSelector2: 'value:sliceCDepBField:selector2',
    });
    expect(sliceCDepB.get(store.state).sliceCDepBSelector2).toBe(
      selector2InitValue,
    );

    store.effect(function effect1(store) {
      const { sliceCDepBSelector1 } = sliceCDepB.track(store);

      effect1Called(sliceCDepBSelector1);
    }, {});

    store.effect(function effect2(store) {
      const { sliceCDepBSelector2 } = sliceCDepB.track(store);

      effect2Called(sliceCDepBSelector2);
    }, {});

    store.effect(function effect3(store) {
      const { sliceCDepBField } = sliceCDepB.track(store);

      effect3Called(sliceCDepBField);
    }, {});

    await waitForExpect(() => {
      expect(effect1Called).toHaveBeenCalledTimes(1);
    });

    expect(effect1Called).toHaveBeenLastCalledWith(
      'value:sliceCDepBField:value:sliceBField1',
    );

    store.dispatch(updateSliceBField1('new-value'));

    await sleep(5);

    expect(sliceB.get(store.state).sliceBField1).toBe('new-value');

    // selector1 should be changed
    expect(sliceCDepB.get(store.state).sliceCDepBSelector1).toBe(
      'value:sliceCDepBField:new-value',
    );

    // selector2 should not be changed
    expect(sliceCDepB.get(store.state).sliceCDepBSelector2).toBe(
      selector2InitValue,
    );

    expect(effect1Called).toBeCalledTimes(2);
    expect(effect1Called).toHaveBeenLastCalledWith(
      sliceCDepB.get(store.state).sliceCDepBSelector1,
    );

    // effect 2 should not be called as selector 2 did not change
    expect(effect2Called).toBeCalledTimes(1);
    // effect 3 should not be called as sliceCDepBField did not change
    expect(effect3Called).toBeCalledTimes(1);
  });

  describe('cleanup', () => {
    test('should run cleanup when effect runs again', async () => {
      const { store, sliceA, updateSliceAField1 } = setup();

      const cleanupCalled = jest.fn<any>();
      const effectCalled = jest.fn<any>();

      store.effect((effectStore) => {
        const { sliceAField1 } = sliceA.track(effectStore);

        effectCalled(sliceAField1);

        cleanup(effectStore, cleanupCalled);
      });

      await waitForExpect(() => {
        expect(effectCalled).toHaveBeenCalledTimes(1);
      });

      expect(effectCalled).toHaveBeenLastCalledWith('value:sliceAField1');

      store.dispatch(updateSliceAField1('new-value'));
      store.dispatch(updateSliceAField1('new-value2'));
      store.dispatch(updateSliceAField1('new-value3'));

      await waitForExpect(() => {
        expect(cleanupCalled).toHaveBeenCalledTimes(1);
      });

      expect(effectCalled).toBeCalledTimes(2);
      expect(cleanupCalled).toBeCalledTimes(1);
    });

    test('should run cleanup function when destroyed', async () => {
      const { store, sliceB } = setup();

      const cleanupCalled = jest.fn<any>();
      const effectCalled = jest.fn<any>();

      const eff = store.effect((effectStore) => {
        const { sliceBField1 } = sliceB.track(effectStore);

        effectCalled(sliceBField1);

        cleanup(effectStore, cleanupCalled);
      });

      await waitForExpect(() => {
        expect(effectCalled).toHaveBeenCalledTimes(1);
      });

      store.destroyEffect(eff);

      await sleep(5);

      expect(cleanupCalled).toBeCalledTimes(1);
    });

    test('effect should not run after it is destroyed', async () => {
      const { store, updateSliceBField1 } = setup();

      const effectCalled = jest.fn();

      const eff = store.effect((store) => {
        const { sliceBField1 } = sliceB.track(store);

        effectCalled(sliceBField1);
      });

      await waitForExpect(() => {
        expect(effectCalled).toHaveBeenCalledTimes(1);
      });

      store.destroyEffect(eff);

      store.dispatch(updateSliceBField1('new-value'));

      await sleep(5);

      expect(effectCalled).toBeCalledTimes(1);
    });
  });

  describe('effects tracking', () => {
    const setup2 = () => {
      const {
        store,
        updateSliceAField1,
        updateSliceAField2,
        updateSliceBField1,
        updateSliceCDepBField,
      } = setup();

      let effect1 = jest.fn();
      let effect2 = jest.fn();
      let effect3 = jest.fn();
      let effect4 = jest.fn();
      let effect5 = jest.fn();

      store.effect(function effectCb1(store) {
        const { sliceAField1 } = sliceA.track(store);
        effect1(sliceAField1);
      }, {});

      store.effect(function effectCb2(store) {
        const { sliceAField1 } = sliceA.track(store);
        const { sliceBField1 } = sliceB.track(store);

        effect2(sliceAField1, sliceBField1);
      }, {});

      store.effect(function effectCb3(store) {
        effect3();
      }, {});

      store.effect(function effectCb4(store) {
        const { sliceAField1, sliceAField2 } = sliceA.track(store);
        const { sliceBField1 } = sliceB.track(store);
        const { sliceCDepBField, sliceCDepBSelector1 } =
          sliceCDepB.track(store);

        effect4(
          sliceAField1,
          sliceAField2,
          sliceBField1,
          sliceCDepBField,
          sliceCDepBSelector1,
        );
      }, {});

      store.effect(function effectCb5(store) {
        const { sliceCDepBSelector1 } = sliceCDepB.track(store);
        effect5(sliceCDepBSelector1);
      }, {});

      return {
        store,
        updateSliceAField1,
        updateSliceAField2,
        updateSliceBField1,
        updateSliceCDepBField,
        effect1,
        effect2,
        effect3,
        effect4,
        effect5,
      };
    };

    test('effect1 tracks sliceAField1', async () => {
      const { store, effect1, updateSliceAField1 } = setup2();
      await sleep(5);

      store.dispatch(updateSliceAField1('new-value'));
      await sleep(5);
      expect(effect1).toHaveBeenCalledTimes(2);
      expect(effect1).toHaveBeenLastCalledWith('new-value');
    });

    test('effect2 tracks sliceAField1, sliceBField1', async () => {
      const { store, effect2, updateSliceAField1, updateSliceBField1 } =
        setup2();

      await sleep(5);

      store.dispatch(updateSliceAField1('new-valueA'));
      store.dispatch(updateSliceBField1('new-valueB'));
      await sleep(5);

      expect(effect2).toHaveBeenCalledTimes(2);
    });

    test('effect3 tracks nothing', async () => {
      const { store, effect3, updateSliceAField1, updateSliceBField1 } =
        setup2();

      store.dispatch(updateSliceAField1('new-value'));
      await sleep(5);

      store.dispatch(updateSliceBField1('new-value'));
      await sleep(5);

      await sleep(5);
      expect(effect3).toHaveBeenCalledTimes(1);
    });

    test('effect4 tracks sliceAField1, sliceAField2, sliceBField1, sliceCDepBField, sliceCDepBSelector1', async () => {
      const {
        store,
        effect4,
        updateSliceAField1,
        updateSliceAField2,
        updateSliceBField1,
        updateSliceCDepBField,
      } = setup2();
      await sleep(5);

      store.dispatch(updateSliceAField1('new-value:updateSliceAField1'));
      store.dispatch(updateSliceAField2('new-value:updateSliceAField2'));
      store.dispatch(updateSliceBField1('new-value:updateSliceBField1'));
      store.dispatch(updateSliceCDepBField('new-value:updateSliceCDepBField'));
      await sleep(5);

      expect(effect4).toHaveBeenCalledTimes(2);

      expect(effect4).nthCalledWith(
        2,
        'new-value:updateSliceAField1',
        'new-value:updateSliceAField2',
        'new-value:updateSliceBField1',
        'new-value:updateSliceCDepBField',
        'new-value:updateSliceCDepBField:new-value:updateSliceBField1',
      );

      store.dispatch(updateSliceAField1('new-new-value:updateSliceAField1'));

      await sleep(5);

      expect(effect4).toHaveBeenCalledTimes(3);

      // updating same value should not trigger effect
      store.dispatch(updateSliceAField1('new-new-value:updateSliceAField1'));

      await sleep(5);

      expect(effect4).toHaveBeenCalledTimes(3);

      // updating to an older value should trigger
      store.dispatch(updateSliceAField1('new-value:updateSliceAField1'));

      await sleep(15);
      expect(effect4).toHaveBeenCalledTimes(4);
    });

    test('effect5 tracks sliceCDepBSelector1', async () => {
      const { store, effect5, updateSliceCDepBField } = setup2();
      await sleep(5);

      store.dispatch(updateSliceCDepBField('new-value'));
      await sleep(5);
      expect(effect5).toHaveBeenCalledTimes(2);
    });
  });
});

describe('effect only', () => {
  const setup = () => {
    const sliceAKey = createKey('sliceA', []);
    const sliceAField1 = sliceAKey.field('value:sliceAField1');
    const sliceAField2 = sliceAKey.field('value:sliceAField2');

    function updateSliceAField1(val: string) {
      return sliceAField1.update(val);
    }

    function updateSliceAField2(val: string) {
      return sliceAField2.update(val);
    }

    const sliceA = sliceAKey.slice({
      sliceAField1,
      sliceAField2,
      updateSliceAField1,
      updateSliceAField2,
    });

    const sliceBKey = createKey('sliceB', []);
    const sliceBField1 = sliceBKey.field('value:sliceBField1');

    const sliceB = sliceBKey.slice({
      sliceBField1,
    });

    const sliceCDepBKey = createKey('sliceCDepB', [sliceB]);
    const sliceCDepBField = sliceCDepBKey.field('value:sliceCDepBField');

    const sliceCDepBSelector1 = sliceCDepBKey.derive((state) => {
      return sliceCDepBField.get(state) + ':' + sliceB.get(state).sliceBField1;
    });

    const sliceCDepBSelector2 = sliceCDepBKey.derive((state) => {
      return sliceCDepBField.get(state) + ':selector2';
    });

    const sliceCDepB = sliceCDepBKey.slice({
      sliceCDepBField,
      sliceCDepBSelector1,
      sliceCDepBSelector2,
    });

    const manualCallbacksRegistry = new Set<() => void | Promise<void>>();
    const manualEffectScheduler: EffectScheduler = (cb, opts) => {
      manualCallbacksRegistry.add(cb);

      return () => {
        if (!manualCallbacksRegistry.has(cb)) {
          throw new Error('unknown callback');
        }
        manualCallbacksRegistry.delete(cb);
      };
    };
    const callback = jest.fn();
    const store = createStore({
      autoStartEffects: true,
      name: 'test',
      slices: [sliceA, sliceB, sliceCDepB],
      overrides: {
        effectScheduler: manualEffectScheduler,
      },
    });

    return {
      sliceA,
      effect: store.effect(() => {
        callback();
      }, {}),
      callback,
      store,
      runEffects: () => {
        manualCallbacksRegistry.forEach((cb) => void cb());
        manualCallbacksRegistry.clear();
      },
    };
  };

  test('runs the effect if it has not run once', async () => {
    const { runEffects, effect, callback } = setup();
    await sleep(5);

    runEffects();

    expect(callback).toHaveBeenCalled();
  });

  test('tracks dependencies correctly', async () => {
    const { runEffects, effect, callback, store, sliceA } = setup();

    let runCount = 0;
    const called = jest.fn();

    store.effect((store) => {
      called(sliceA.get(store.state).sliceAField1);
      if (runCount++ == 1) {
        return;
      }
      const { sliceAField1 } = sliceA.track(store);
    });

    await sleep(5);
    runEffects();

    store.dispatch(sliceA.updateSliceAField1('new-value'));
    await sleep(5);
    runEffects();

    store.dispatch(sliceA.updateSliceAField1('new-value2'));
    await sleep(5);
    runEffects();

    store.dispatch(sliceA.updateSliceAField1('new-value3'));
    await sleep(5);
    runEffects();

    expect(called).toHaveBeenCalledTimes(2);
    // first initial setup call
    expect(called).nthCalledWith(1, 'value:sliceAField1');
    expect(called).nthCalledWith(2, 'new-value');
    // in the second since  it tracks nothing we should not expect this
    // effect to be called again

    await sleep(5);
    runEffects();

    expect(called).toHaveBeenCalledTimes(2);
  });
});

describe('dependent slices', () => {
  const setup = () => {
    const sliceAKey = createKey('sliceA', []);
    const sliceAField1 = sliceAKey.field('value:sliceAField1');

    const sliceADrived = sliceAKey.derive((state) => {
      return sliceAField1.get(state) + ':derived';
    });

    function updateAField1(val: string) {
      return sliceAField1.update(val);
    }

    const sliceA = sliceAKey.slice({
      sliceADrived,
      updateAField1,
    });

    const sliceBKey = createKey('sliceB', [sliceA]);

    const sliceB = sliceBKey.slice({});

    const sliceBNoTrackCalled = jest.fn();

    const sliceBNoTrack = sliceBKey.effect(function sliceBNoTrack(store) {
      sliceBNoTrackCalled();
    });

    const sliceBTrackCalled = jest.fn();

    const sliceBTrack = sliceBKey.effect(function sliceBTrack(store) {
      const { sliceADrived } = sliceA.track(store);
      sliceBTrackCalled(sliceADrived);
    });

    return {
      createTestStore: (options: Partial<StoreOptions<any>> = {}) =>
        createStore({
          name: 'test',
          slices: [sliceA, sliceB],
          overrides: {},
          ...options,
        }),
      sliceA,
      sliceB,
      sliceBNoTrack,
      sliceBNoTrackCalled,
      sliceBTrack,
      sliceBTrackCalled,
    };
  };

  test('runs all effect  dependent changes', async () => {
    const { createTestStore, sliceBTrackCalled, sliceBNoTrackCalled } = setup();

    const store = createTestStore({ autoStartEffects: true });

    await sleep(SAFE_WAIT);

    expect(sliceBTrackCalled).toBeCalledTimes(1);
    expect(sliceBNoTrackCalled).toBeCalledTimes(1);
  });

  test('when autoStart is false', async () => {
    const { createTestStore, sliceBTrackCalled, sliceBNoTrackCalled } = setup();

    const store = createTestStore({ autoStartEffects: false });

    await sleep(SAFE_WAIT);

    expect(sliceBTrackCalled).toBeCalledTimes(0);
    expect(sliceBNoTrackCalled).toBeCalledTimes(0);

    store.startEffects();
    expect(sliceBTrackCalled).toBeCalledTimes(0);
    expect(sliceBNoTrackCalled).toBeCalledTimes(0);
    await sleep(SAFE_WAIT);
    expect(sliceBTrackCalled).toBeCalledTimes(1);
    expect(sliceBNoTrackCalled).toBeCalledTimes(1);
  });

  test('updating parent slice', async () => {
    const { createTestStore, sliceA, sliceBTrackCalled, sliceBNoTrackCalled } =
      setup();

    const store = createTestStore({ autoStartEffects: true });
    await sleep(SAFE_WAIT);

    store.dispatch(sliceA.updateAField1('new-value'));
    await sleep(SAFE_WAIT);
    expect(sliceBTrackCalled).toBeCalledTimes(2);
    expect(sliceBTrackCalled).toHaveBeenLastCalledWith('new-value:derived');

    expect(sliceBNoTrackCalled).toBeCalledTimes(1);
  });

  test('updating parent slice right after creation', async () => {
    const { createTestStore, sliceA, sliceBTrackCalled, sliceBNoTrackCalled } =
      setup();

    const store = createTestStore({ autoStartEffects: true });
    store.dispatch(sliceA.updateAField1('new-value'));
    expect(sliceBTrackCalled).toBeCalledTimes(0);
    expect(sliceBNoTrackCalled).toBeCalledTimes(0);

    await sleep(SAFE_WAIT);
    expect(sliceBTrackCalled).toBeCalledTimes(1);
    expect(sliceBNoTrackCalled).toBeCalledTimes(1);
  });

  test('updating parent slice back to same value after creation', async () => {
    const { createTestStore, sliceA, sliceBTrackCalled, sliceBNoTrackCalled } =
      setup();

    const store = createTestStore({ autoStartEffects: true });
    store.dispatch(sliceA.updateAField1('new-value'));
    await sleep(SAFE_WAIT);

    store.dispatch(sliceA.updateAField1('new-value-1'));
    await sleep(1);
    store.dispatch(sliceA.updateAField1('new-value'));

    await sleep(SAFE_WAIT);
    // since in a short time we updated to the same value it say, the effect should not run again
    expect(sliceBTrackCalled).toBeCalledTimes(1);
    expect(sliceBNoTrackCalled).toBeCalledTimes(1);
  });

  test('stopping the effect run', async () => {
    const { createTestStore, sliceA, sliceBTrackCalled, sliceBNoTrackCalled } =
      setup();

    const store = createTestStore({ autoStartEffects: true });
    store.dispatch(sliceA.updateAField1('new-value'));
    await sleep(1);
    store.pauseEffects();
    await sleep(SAFE_WAIT);
    expect(sliceBTrackCalled).toBeCalledTimes(0);
    expect(sliceBNoTrackCalled).toBeCalledTimes(0);

    store.startEffects();
    await sleep(SAFE_WAIT);
    expect(sliceBTrackCalled).toBeCalledTimes(1);
    expect(sliceBTrackCalled).toHaveBeenLastCalledWith('new-value:derived');
    expect(sliceBNoTrackCalled).toBeCalledTimes(1);
  });

  test('stopping and starting multiple times', async () => {
    const { createTestStore, sliceA, sliceBTrackCalled, sliceBNoTrackCalled } =
      setup();

    const store = createTestStore({ autoStartEffects: true });
    store.dispatch(sliceA.updateAField1('new-value'));
    store.pauseEffects();
    store.startEffects();
    await sleep(SAFE_WAIT);
    store.pauseEffects();
    store.startEffects();
    await sleep(SAFE_WAIT);
    expect(sliceBTrackCalled).toBeCalledTimes(2);
    expect(sliceBTrackCalled).toHaveBeenLastCalledWith('new-value:derived');
    expect(sliceBNoTrackCalled).toBeCalledTimes(2);
  });

  test('destroying an effect when paused', async () => {
    const {
      createTestStore,
      sliceA,
      sliceBTrackCalled,
      sliceBTrack,
      sliceBNoTrackCalled,
    } = setup();

    const store = createTestStore({ autoStartEffects: true });
    store.pauseEffects();
    store.destroyEffect(sliceBTrack);
    store.startEffects();
    await sleep(SAFE_WAIT);
    expect(sliceBTrackCalled).toBeCalledTimes(0);
  });

  test('destroying an effect after a run when paused', async () => {
    const {
      createTestStore,
      sliceA,
      sliceBTrackCalled,
      sliceBTrack,
      sliceBNoTrackCalled,
    } = setup();

    const store = createTestStore({ autoStartEffects: true });
    store.pauseEffects();
    store.dispatch(sliceA.updateAField1('new-value'));
    store.startEffects();
    await sleep(SAFE_WAIT);
    expect(sliceBTrackCalled).toBeCalledTimes(1);

    store.destroyEffect(sliceBTrack);

    // shouldn't run after resume work
    store.pauseEffects();
    store.startEffects();
    await sleep(SAFE_WAIT);
    expect(sliceBTrackCalled).toBeCalledTimes(1);

    // shouldn't run if state changes
    store.dispatch(sliceA.updateAField1('new-value-2'));
    await sleep(SAFE_WAIT);
    expect(sliceBTrackCalled).toBeCalledTimes(1);
  });
});

describe('throwing error', () => {
  const setup = () => {
    const sliceAKey = createKey('sliceA', []);
    const sliceAField1 = sliceAKey.field('value:sliceAField1');

    const sliceADrived = sliceAKey.derive((state) => {
      return sliceAField1.get(state) + ':derived';
    });

    const sliceAEffectMock = jest.fn();
    const sliceAEffect2Mock = jest.fn();

    const sliceAEffect = sliceAKey.effect(function sliceAEffect(store) {
      const val = sliceADrived.track(store);
      sliceAEffectMock(val);
    });

    const sliceAEffect2 = sliceAKey.effect(function sliceAEffect(store) {
      const val = sliceADrived.track(store);
      sliceAEffect2Mock(val);
    });

    function updateAField1(val: string) {
      return sliceAField1.update(val);
    }

    const sliceA = sliceAKey.slice({
      sliceADrived,
      updateAField1,
    });

    return {
      createTestStore: (options: Partial<StoreOptions<any>> = {}) =>
        createStore({
          name: 'test',
          slices: [sliceA],
          ...options,
          overrides: {
            ...options.overrides,
          },
        }),
      sliceA,
      sliceAKey,
      sliceAEffect,
      sliceAEffectMock,
      sliceAEffect2Mock,
    };
  };

  test('throwing of error doesn\nt breaks the current run of effects but future runs work', async () => {
    const { sliceAEffect2Mock, createTestStore, sliceAEffectMock, sliceA } =
      setup();

    let count = 0;
    sliceAEffectMock.mockImplementation(() => {
      if (count++ === 1) {
        throw new Error('effect error');
      }
    });

    const store = createTestStore({
      autoStartEffects: true,
      overrides: {
        effectScheduler: (cb) => {
          void cb();
          return () => {};
        },
      },
    });

    await sleep(SAFE_WAIT);
    expect(() => {
      store.dispatch(sliceA.updateAField1('new-value'));
    }).toThrowError(/effect error/);
    expect(sliceAEffectMock).toBeCalledTimes(2);
    // second effect cannot run because first effect threw a sync error
    expect(sliceAEffect2Mock).toBeCalledTimes(1);

    await sleep(SAFE_WAIT);

    // new dispatches should work fine if nothing throws error
    store.dispatch(sliceA.updateAField1('new-value2'));

    expect(sliceAEffectMock).toBeCalledTimes(3);

    expect(sliceAEffectMock).nthCalledWith(1, 'value:sliceAField1:derived');
    expect(sliceAEffectMock).nthCalledWith(2, 'new-value:derived');
    expect(sliceAEffectMock).nthCalledWith(3, 'new-value2:derived');
    expect(sliceAEffect2Mock).toBeCalledTimes(2);

    expect(sliceAEffect2Mock).nthCalledWith(1, 'value:sliceAField1:derived');
    expect(sliceAEffect2Mock).nthCalledWith(2, 'new-value2:derived');
  });

  test('throwing of async error', async () => {
    const {
      sliceAEffectMock,
      sliceAEffect2Mock,
      createTestStore,
      sliceAKey,
      sliceA,
    } = setup();

    let count = 0;

    sliceAKey.effect(async (store) => {
      const { sliceADrived } = sliceA.track(store);
      if (count++ === 1) {
        throw new Error('effect async error');
      }
      await sleep(1);
    });

    const onError = jest.fn();

    const store = createTestStore({
      autoStartEffects: true,
      overrides: {
        effectScheduler: (run) => {
          let id = setTimeout(() => {
            let r = run();
            if (r) {
              r.catch((err) => {
                onError(err);
              });
            }
          }, 5);
          return () => {
            clearTimeout(id);
          };
        },
      },
    });

    store.dispatch(sliceA.updateAField1('new-value'));

    store.dispatch(sliceA.updateAField1('new-value2'));
    await sleep(SAFE_WAIT);

    store.dispatch(sliceA.updateAField1('new-value3'));

    await sleep(SAFE_WAIT);

    expect(onError).toBeCalledTimes(1);
    expect(onError).toBeCalledWith(new Error('effect async error'));

    // other effects should continue to work
    expect(sliceAEffectMock).toBeCalledTimes(2);
    expect(sliceAEffect2Mock).toBeCalledTimes(2);
  });

  test('scheduler is called with correct options', async () => {
    const { createTestStore, sliceAKey, sliceA } = setup();

    sliceAKey.effect(
      async (store) => {
        await sleep(1);
      },
      {
        metadata: {
          mySpecialEffect: 'mySpecialValue',
        },
      },
    );

    const optionsCalled = jest.fn();

    const store = createTestStore({
      autoStartEffects: true,
      overrides: {
        effectScheduler: (run, options) => {
          optionsCalled(options);
          const id = setTimeout(() => {
            void run();
          }, DEFAULT_MAX_WAIT);
          return () => {
            clearTimeout(id);
          };
        },
      },
    });

    await sleep(SAFE_WAIT);

    store.dispatch(sliceA.updateAField1('new-value'));

    await sleep(SAFE_WAIT);

    expect(optionsCalled).toBeCalledTimes(5);

    expect(
      optionsCalled.mock.calls
        .map((r) => r[0] as EffectOpts)
        .find((r) => r?.metadata?.['mySpecialEffect'] === 'mySpecialValue'),
    ).toEqual({
      maxWait: 15,
      metadata: {
        mySpecialEffect: 'mySpecialValue',
      },
      name: 'effect__unnamed-effect$',
    });
  });
});
