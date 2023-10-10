import { expect, jest, test, describe, beforeEach } from '@jest/globals';
import { testCleanup } from '../../helpers/test-cleanup';
import { createKey } from '../../slice/key';
import { EffectRun } from '../effect-run';
import { createStore } from '../../store';
import { EffectScheduler } from '../effect';

function sleep(t = 5): Promise<void> {
  return new Promise((res) => setTimeout(res, t));
}

const zeroTimeoutScheduler: EffectScheduler = (cb, opts) => {
  let id = setTimeout(cb, 0);

  return () => {
    clearTimeout(id);
  };
};

describe('EffectRun', () => {
  const setup = () => {
    const sliceAKey = createKey('slice1', []);
    const fooField = sliceAKey.field('bar');
    const sliceA = sliceAKey.slice({
      foo: fooField,
    });

    const sliceBKey = createKey('slice2', []);
    const sliceBField = sliceBKey.field('bar');
    const sliceBOtherField = sliceBKey.field('bizz');
    const sliceB = sliceBKey.slice({
      sliceBField: sliceBField,
      sliceBOtherField: sliceBOtherField,
    });

    const store = createStore({
      autoStartEffects: true,
      name: 'test',
      slices: [sliceA, sliceB],
      overrides: {
        effectScheduler: zeroTimeoutScheduler,
      },
    });

    return {
      store,
      sliceA,
      fooField,
      sliceBField,
      sliceBOtherField,
      sliceB,
    };
  };

  describe('dependencies are tracked', () => {
    test('should identify tracked slice correctly', () => {
      const { store, sliceA, sliceB, fooField, sliceBField } = setup();
      let runInstance = new EffectRun(store, 'test');
      runInstance.addTrackedField(fooField, 'foo');
      expect(
        runInstance.getTrackedFields().find((r) => r.field === fooField),
      ).toBeDefined();
      expect(
        runInstance.getTrackedFields().find((r) => r.field === sliceBField),
      ).toBeUndefined();
    });
  });

  describe('getFieldsThatChanged', () => {
    test('should return false for a blank instance', () => {
      const { store } = setup();
      let runInstance1 = new EffectRun(store, 'test');

      expect(runInstance1.getFieldsThatChanged()).toBeUndefined();
    });

    test('should return undefined when value is the same', () => {
      const { store, sliceA, sliceB, fooField } = setup();
      let runInstance1 = new EffectRun(store, 'test');
      runInstance1.addTrackedField(fooField, fooField.initialValue);

      expect(runInstance1.getFieldsThatChanged()).toBeUndefined();
      expect(
        // it should be still tracked
        runInstance1.getTrackedFields().find((r) => r.field === fooField),
      ).toBeDefined();
    });

    test('should return field if tracked things have changed', () => {
      const { store, sliceA, sliceB, fooField } = setup();
      let runInstance1 = new EffectRun(store, 'test');
      runInstance1.addTrackedField(fooField, fooField.initialValue);

      expect(runInstance1.getFieldsThatChanged()).toBeUndefined();

      store.dispatch(fooField.update('new value'));

      expect(runInstance1.getFieldsThatChanged()).toBe(fooField);
    });

    test('should return undefined if none of tracked fields have changed', () => {
      const { store, sliceA, sliceB, fooField, sliceBField } = setup();
      let runInstance1 = new EffectRun(store, 'test');
      runInstance1.addTrackedField(fooField, fooField.initialValue);

      expect(runInstance1.getFieldsThatChanged()).toBeUndefined();

      store.dispatch(sliceBField.update('new value'));

      expect(runInstance1.getFieldsThatChanged()).toBeUndefined();
    });

    test('should return undefined if none of tracked fields have changed : 2', () => {
      const { store, sliceA, sliceB, sliceBField, sliceBOtherField } = setup();
      let updateField = (val: string) => sliceBField.update(val);

      let updateOtherField = (val: string) => sliceBOtherField.update(val);

      let runInstance1 = new EffectRun(store, 'test');

      runInstance1.addTrackedField(
        sliceBField,
        sliceB.get(store.state).sliceBField,
      );

      expect(runInstance1.getFieldsThatChanged()).toBeUndefined();

      store.dispatch(updateOtherField('xyz'));

      expect(runInstance1.getFieldsThatChanged()).toBeUndefined();

      store.dispatch(updateField('xyz'));

      expect(runInstance1.getFieldsThatChanged()).toBe(sliceBField);
    });

    describe('cleanup', () => {
      test('executes all cleanup callbacks on destroy', () => {
        const { store, sliceA, sliceB, sliceBField, sliceBOtherField } =
          setup();

        let runInstance1 = new EffectRun(store, 'test');
        const cleanup = jest.fn(async () => {});
        runInstance1.addCleanup(cleanup);
        expect(cleanup).toBeCalledTimes(0);

        runInstance1.destroy();
        expect(cleanup).toBeCalledTimes(1);

        // if called again, it should not be called again

        runInstance1.destroy();
        expect(cleanup).toBeCalledTimes(1);
      });

      test('should call callbacks only once', () => {
        const { store, sliceA, sliceB, sliceBField, sliceBOtherField } =
          setup();

        let runInstance1 = new EffectRun(store, 'test');
        const cleanup = jest.fn(async () => {});
        runInstance1.addCleanup(cleanup);

        runInstance1.destroy();
        runInstance1.destroy();
        runInstance1.destroy();

        expect(cleanup).toBeCalledTimes(1);
      });

      test('should run callback immediately if added after destroy', () => {
        const { store, sliceA, sliceB, sliceBField, sliceBOtherField } =
          setup();

        let runInstance1 = new EffectRun(store, 'test');
        const cleanup = jest.fn(async () => {});

        runInstance1.destroy();
        runInstance1.addCleanup(cleanup);
        expect(cleanup).toBeCalledTimes(1);
      });
    });
  });
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
    sliceBKey.effect((store) => {
      const { secondFieldInSliceB } = sliceB.track(store);
      sliceBSecondFieldEffectTriggered();
    });

    let manualCallbacksRegistry: { current: Set<() => void> } = {
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
            cb();
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

  test('if paused effects dont run even after multiple dispatches', async () => {
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

    store.dispatch(sliceB.updateFirstFieldInSliceB('new value'));
    await invokeManualTriggers();

    expect(combinedEffectTriggered).toBeCalledTimes(2);
    expect(sliceBSecondFieldEffectTriggered).toBeCalledTimes(1);

    store.pauseEffects();

    store.dispatch(sliceB.updateFirstFieldInSliceB('new value 2'));
    await invokeManualTriggers();

    expect(store._effectsManager._slicesChanged.size).toBe(1);

    store._effectsManager._effects.forEach((effect) => {
      jest.spyOn(effect, '_run');
    });
    store.startEffects();

    for (const effect of store._effectsManager._effects) {
      const fn = jest.fn();
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(effect._run as jest.Mock).toBeCalledTimes(1);
      // run is called with all the slices which is 2
      expect(
        ((effect._run as jest.Mock).mock.lastCall?.at(0) as any).size,
      ).toEqual(2);
    }

    await sleep(4);
    // since scheduler hasnt triggered
    expect(combinedEffectTriggered).toBeCalledTimes(2);

    await invokeManualTriggers();

    expect(combinedEffectTriggered).toBeCalledTimes(3);
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

    newEffect._destroy();
    store.dispatch(sliceA.updateFieldInSliceA('new value2'));

    await invokeManualTriggers();
    expect(removableEffectTriggered).toBeCalledTimes(2);
  });
});
