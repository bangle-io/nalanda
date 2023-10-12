import { beforeEach, expect, jest, test, describe } from '@jest/globals';
import { createKey } from '../../slice/key';
import { createStore } from '../../store';
import { EffectScheduler } from '../types';
import { testCleanup } from '../../helpers/test-cleanup';

function sleep(t = 5): Promise<void> {
  return new Promise((res) => setTimeout(res, t));
}

beforeEach(() => {
  testCleanup();
});

describe('effects', () => {
  const setup = ({
    autoStartEffects,
  }: {
    autoStartEffects?: boolean;
  } = {}) => {
    const sliceAKey = createKey('sliceA', []);
    const fieldInSliceA = sliceAKey.field('bar');
    const derivedFieldInSliceA = sliceAKey.derive((state) => {
      return fieldInSliceA.get(state) + ' derived';
    });

    function updateFieldInSliceA(val: string) {
      return fieldInSliceA.update(val);
    }

    const sliceA = sliceAKey.slice({
      fieldInSliceA,
      derivedFieldInSliceA,
      updateFieldInSliceA,
    });

    const sliceBKey = createKey('sliceB', []);
    const firstFieldInSliceB = sliceBKey.field('bar');
    const secondFieldInSliceB = sliceBKey.field('bizz');

    function updateSecondFieldInSliceB(val: string) {
      return secondFieldInSliceB.update(val);
    }

    function updateFirstFieldInSliceB(val: string) {
      return firstFieldInSliceB.update(val);
    }

    const sliceB = sliceBKey.slice({
      firstFieldInSliceB,
      secondFieldInSliceB,
      updateSecondFieldInSliceB,
      updateFirstFieldInSliceB,
    });

    const sliceBSecondFieldEffectTriggered = jest.fn();
    sliceBKey.effect(function sliceBEffect(store) {
      const { secondFieldInSliceB } = sliceB.track(store);
      sliceBSecondFieldEffectTriggered(secondFieldInSliceB);
    });

    let manualCallbacksRegistry: { current: Set<() => Promise<void> | void> } =
      {
        current: new Set(),
      };

    const manualEffectScheduler: EffectScheduler = (cb, opts) => {
      manualCallbacksRegistry.current.add(cb);

      return () => {
        if (!manualCallbacksRegistry.current.has(cb)) {
          throw new Error('unknown callback');
        }
        manualCallbacksRegistry.current.delete(cb);
      };
    };

    const store = createStore({
      autoStartEffects: autoStartEffects,
      name: 'test',
      slices: [sliceA, sliceB],
      overrides: {
        effectScheduler: manualEffectScheduler,
      },
    });

    const combinedEffectTriggered = jest.fn();
    store.effect(function combinedEffect(store) {
      const { firstFieldInSliceB } = sliceB.track(store);
      const { derivedFieldInSliceA } = sliceA.track(store);
      combinedEffectTriggered({ firstFieldInSliceB, derivedFieldInSliceA });
    });

    return {
      store,
      sliceA,
      fieldInSliceA,
      firstFieldInSliceB,
      secondFieldInSliceB,
      sliceB,
      combinedEffectTriggered,
      sliceBSecondFieldEffectTriggered,
      invokeManualTriggers: async (onError?: (error: any) => void) => {
        await sleep(0);
        manualCallbacksRegistry.current.forEach((cb) => {
          try {
            void cb();
          } catch (error) {
            if (!onError) {
              throw error;
            } else {
              onError(error);
            }
          }
        });
      },
    };
  };

  test('should pause effects by default', async () => {
    const {
      combinedEffectTriggered,
      sliceBSecondFieldEffectTriggered,
      invokeManualTriggers,
    } = setup();

    await invokeManualTriggers();

    expect(combinedEffectTriggered).toBeCalledTimes(0);
    expect(sliceBSecondFieldEffectTriggered).toBeCalledTimes(0);
  });

  test('should run effects if autoStartEffects = true', async () => {
    const {
      combinedEffectTriggered,
      sliceBSecondFieldEffectTriggered,
      invokeManualTriggers,
    } = setup({
      autoStartEffects: true,
    });

    await invokeManualTriggers();

    expect(combinedEffectTriggered).toBeCalledTimes(1);
    expect(sliceBSecondFieldEffectTriggered).toBeCalledTimes(1);
  });

  test('effects are not started by default', async () => {
    const {
      combinedEffectTriggered,
      sliceBSecondFieldEffectTriggered,
      invokeManualTriggers,
    } = setup({ autoStartEffects: false });

    await invokeManualTriggers();

    expect(combinedEffectTriggered).toBeCalledTimes(0);
    expect(sliceBSecondFieldEffectTriggered).toBeCalledTimes(0);
  });

  test('effects start on demand', async () => {
    const {
      store,
      combinedEffectTriggered,
      sliceBSecondFieldEffectTriggered,
      invokeManualTriggers,
    } = setup({ autoStartEffects: false });

    store.startEffects();
    await invokeManualTriggers();

    expect(combinedEffectTriggered).toBeCalledTimes(1);
    expect(sliceBSecondFieldEffectTriggered).toBeCalledTimes(1);
  });

  test('starting effects multiple times has no additional effect', async () => {
    const {
      store,
      combinedEffectTriggered,
      sliceBSecondFieldEffectTriggered,
      invokeManualTriggers,
    } = setup({ autoStartEffects: false });

    store.startEffects();
    await invokeManualTriggers();

    store.startEffects();
    await invokeManualTriggers();

    expect(combinedEffectTriggered).toBeCalledTimes(1);
    expect(sliceBSecondFieldEffectTriggered).toBeCalledTimes(1);
  });

  test('update to a field triggers relevant effect', async () => {
    const {
      store,
      sliceB,
      sliceBSecondFieldEffectTriggered,
      invokeManualTriggers,
    } = setup({ autoStartEffects: true });

    store.dispatch(sliceB.updateSecondFieldInSliceB('new value'));
    await invokeManualTriggers();

    // Should have one run
    expect(sliceBSecondFieldEffectTriggered).toBeCalledTimes(1);
  });

  test("update to a field doesn't trigger non-related effect", async () => {
    const { store, sliceB, combinedEffectTriggered, invokeManualTriggers } =
      setup({ autoStartEffects: true });

    await invokeManualTriggers();

    expect(combinedEffectTriggered).toBeCalledTimes(1);

    store.dispatch(sliceB.updateSecondFieldInSliceB('new value'));
    await invokeManualTriggers();

    expect(combinedEffectTriggered).toBeCalledTimes(1);
  });

  test("if paused effects don't run even after multiple dispatches", async () => {
    const {
      store,
      sliceB,
      combinedEffectTriggered,
      sliceBSecondFieldEffectTriggered,
      invokeManualTriggers,
    } = setup({ autoStartEffects: true });

    await invokeManualTriggers();

    expect(combinedEffectTriggered).toBeCalledTimes(1);
    expect(sliceBSecondFieldEffectTriggered).toBeCalledTimes(1);

    store.dispatch(sliceB.updateFirstFieldInSliceB('new value 1'));
    await invokeManualTriggers();

    expect(combinedEffectTriggered).toBeCalledTimes(2);
    expect(sliceBSecondFieldEffectTriggered).toBeCalledTimes(1);

    store.dispatch(sliceB.updateSecondFieldInSliceB('new value 2'));

    await invokeManualTriggers();

    expect(combinedEffectTriggered).toBeCalledTimes(2);
    expect(sliceBSecondFieldEffectTriggered).toBeCalledTimes(2);
    expect(sliceBSecondFieldEffectTriggered).toHaveBeenLastCalledWith(
      'new value 2',
    );

    store.pauseEffects();

    // update the same thing again
    store.dispatch(sliceB.updateSecondFieldInSliceB('new value 3'));
    await invokeManualTriggers();
    await sleep(10);
    // should not be called
    expect(sliceBSecondFieldEffectTriggered).toBeCalledTimes(2);

    store.startEffects();
    await invokeManualTriggers();
    await sleep(10);
    expect(sliceBSecondFieldEffectTriggered).toBeCalledTimes(3);
    // gets the pending value
    expect(sliceBSecondFieldEffectTriggered).toHaveBeenLastCalledWith(
      'new value 3',
    );
  });

  test('paused, dispatches multiple and then resume', async () => {
    const {
      store,
      sliceB,
      combinedEffectTriggered,
      sliceBSecondFieldEffectTriggered,
      invokeManualTriggers,
    } = setup({ autoStartEffects: true });

    await invokeManualTriggers();

    expect(combinedEffectTriggered).toBeCalledTimes(1);
    expect(sliceBSecondFieldEffectTriggered).toBeCalledTimes(1);
    expect(sliceBSecondFieldEffectTriggered).toHaveBeenLastCalledWith('bizz');

    store.pauseEffects();
    store.dispatch(sliceB.updateSecondFieldInSliceB('new value 3'));
    store.dispatch(sliceB.updateSecondFieldInSliceB('new value 4'));
    store.dispatch(sliceB.updateSecondFieldInSliceB('new value 5'));

    store.dispatch(sliceB.updateFirstFieldInSliceB('first:new value'));

    store.startEffects();
    await invokeManualTriggers();
    await sleep(10);

    expect(combinedEffectTriggered).toBeCalledTimes(2);
    expect(sliceBSecondFieldEffectTriggered).toBeCalledTimes(2);
    expect(sliceBSecondFieldEffectTriggered).toHaveBeenLastCalledWith(
      'new value 5',
    );
  });

  test('destroying when paused', async () => {
    const {
      store,
      sliceB,
      combinedEffectTriggered,
      sliceBSecondFieldEffectTriggered,
      invokeManualTriggers,
    } = setup({ autoStartEffects: true });

    await invokeManualTriggers();
    expect(sliceBSecondFieldEffectTriggered).toBeCalledTimes(1);

    store.pauseEffects();

    store.destroy();
    store.dispatch(sliceB.updateSecondFieldInSliceB('new value 3'));

    store.startEffects();

    store.dispatch(sliceB.updateSecondFieldInSliceB('new value 4'));

    await invokeManualTriggers();
    await sleep(10);

    expect(sliceBSecondFieldEffectTriggered).toBeCalledTimes(1);
  });

  test('should run newly added effects if autoStartEffects=true', async () => {
    const {
      store,
      sliceA,
      combinedEffectTriggered,
      sliceBSecondFieldEffectTriggered,
      invokeManualTriggers,
    } = setup({
      autoStartEffects: true,
    });

    await sleep(5); // Wait for 5ms

    const newEffectTriggered = jest.fn();
    store.effect(function newEffect(store) {
      const { derivedFieldInSliceA } = sliceA.track(store);
      newEffectTriggered({ derivedFieldInSliceA });
    });

    await invokeManualTriggers();

    // Verify that the new effect was called
    expect(newEffectTriggered).toBeCalledTimes(1);
  });

  test('should not run newly added effects until startEffects if autoStartEffects=false', async () => {
    const {
      store,
      sliceA,
      combinedEffectTriggered,
      sliceBSecondFieldEffectTriggered,
      invokeManualTriggers,
    } = setup({
      autoStartEffects: false,
    });

    await sleep(5); // Wait for 5ms

    const newEffectTriggered = jest.fn();
    store.effect(function newEffect(store) {
      const { derivedFieldInSliceA } = sliceA.track(store);
      newEffectTriggered({ derivedFieldInSliceA });
    });

    await invokeManualTriggers();

    // Verify that the new effect was NOT called
    expect(newEffectTriggered).toBeCalledTimes(0);
    expect(combinedEffectTriggered).toBeCalledTimes(0);
    expect(sliceBSecondFieldEffectTriggered).toBeCalledTimes(0);

    // Now, start the effects and verify
    store.startEffects();
    await invokeManualTriggers();

    expect(newEffectTriggered).toBeCalledTimes(1);
    expect(combinedEffectTriggered).toBeCalledTimes(1);
    expect(sliceBSecondFieldEffectTriggered).toBeCalledTimes(1);
  });

  test('effect throws an exception is handled in scheduler', async () => {
    const { store, sliceA, invokeManualTriggers } = setup({
      autoStartEffects: true,
    });

    const errorEffectTriggered = jest.fn();
    store.effect(function errorEffect() {
      errorEffectTriggered();
      throw new Error('Effect error!');
    });

    const anotherEffectTriggered = jest.fn();
    store.effect(function anotherEffect(store) {
      const { derivedFieldInSliceA } = sliceA.track(store);
      anotherEffectTriggered({ derivedFieldInSliceA });
    });

    await sleep();

    const onError = jest.fn();
    await invokeManualTriggers(onError);

    expect(onError).toBeCalledTimes(1);

    expect(errorEffectTriggered).toBeCalledTimes(1);
    expect(anotherEffectTriggered).toBeCalledTimes(1); // Ensure the other effect still runs
  });

  test('effect destroyed is prevented being executed', async () => {
    const { store, sliceA, invokeManualTriggers } = setup({
      autoStartEffects: true,
    });

    // Register an effect and get its removal function
    const removableEffectTriggered = jest.fn();
    const newEffect = store.effect(function removableEffect(store) {
      const { derivedFieldInSliceA } = sliceA.track(store);
      removableEffectTriggered({ derivedFieldInSliceA });
    });

    await invokeManualTriggers();

    expect(removableEffectTriggered).toBeCalledTimes(1);

    // update the value
    store.dispatch(sliceA.updateFieldInSliceA('new value'));

    await invokeManualTriggers();

    expect(removableEffectTriggered).toBeCalledTimes(2);

    // now destroy it

    store.destroyEffect(newEffect);
    store.dispatch(sliceA.updateFieldInSliceA('new value2'));

    await invokeManualTriggers();
    expect(removableEffectTriggered).toBeCalledTimes(2);
  });
});
