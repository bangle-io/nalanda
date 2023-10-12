import { beforeEach, expect, jest, test, describe } from '@jest/globals';
import { createKey } from '../../slice/key';
import { createStore } from '../../store';
import { EffectCleanupCallback, EffectScheduler, FieldTracker } from '../types';
import { EffectStore } from '../effect-store';
import { whatFieldChanged } from '../utils';

import { createEffectConfig } from '../effect';
import { Slice } from '../../slice/slice';
import { EffectTracker } from '../effect-tracker';
import { testCleanup } from '../../helpers/test-cleanup';

beforeEach(() => {
  testCleanup();
});

const zeroTimeoutScheduler: EffectScheduler = (cb, opts) => {
  let id = setTimeout(() => {
    void cb();
  }, 0);

  return () => {
    clearTimeout(id);
  };
};

describe('EffectStore', () => {
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

    const tracker: FieldTracker[] = [];
    const effectConfig = createEffectConfig(() => {});
    const effectTracker = new EffectTracker(tracker);
    let efStore = new EffectStore(store, effectTracker);

    return {
      tracker,
      efStore,
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
      const { fooField, sliceBField, tracker, efStore } = setup();

      efStore._addTrackField({ field: fooField, value: 'foo' });
      expect(tracker.find((r) => r.field === fooField)).toBeDefined();
      expect(tracker.find((r) => r.field === sliceBField)).toBeUndefined();
    });
  });

  describe('getFieldsThatChanged', () => {
    test('should return false for a blank instance', () => {
      const { tracker, efStore, store } = setup();

      expect(whatFieldChanged(efStore.state, tracker)).toBeUndefined();
    });

    test('should return undefined when value is the same', () => {
      const { efStore, tracker, store, sliceA, sliceB, fooField } = setup();
      efStore._addTrackField({
        field: fooField,
        value: fooField.initialValue,
      });

      expect(whatFieldChanged(efStore.state, tracker)).toBeUndefined();
      expect(
        // it should be still tracked
        tracker.find((r) => r.field === fooField),
      ).toBeDefined();
    });

    test('should return field if tracked things have changed', () => {
      const { store, sliceA, sliceB, fooField, tracker, efStore } = setup();
      efStore._addTrackField({
        field: fooField,
        value: fooField.initialValue,
      });

      expect(whatFieldChanged(efStore.state, tracker)).toBeUndefined();

      store.dispatch(fooField.update('new value'));

      expect(whatFieldChanged(efStore.state, tracker)).toEqual({
        oldVal: fooField.initialValue,
        field: fooField,
        newVal: 'new value',
      });
    });

    test('should return undefined if none of tracked fields have changed', () => {
      const { store, sliceA, sliceB, fooField, sliceBField, tracker, efStore } =
        setup();
      efStore._addTrackField({
        field: fooField,
        value: fooField.initialValue,
      });

      expect(whatFieldChanged(efStore.state, tracker)).toBeUndefined();

      store.dispatch(sliceBField.update('new value'));

      expect(whatFieldChanged(efStore.state, tracker)).toBeUndefined();
    });

    test('should return undefined if none of tracked fields have changed : 2', () => {
      const {
        store,
        sliceA,
        sliceB,
        sliceBField,
        sliceBOtherField,
        tracker,
        efStore,
      } = setup();
      let updateField = (val: string) => sliceBField.update(val);

      let updateOtherField = (val: string) => sliceBOtherField.update(val);

      efStore._addTrackField({
        field: sliceBField,
        value: sliceB.get(store.state).sliceBField,
      });

      expect(whatFieldChanged(efStore.state, tracker)).toBeUndefined();

      store.dispatch(updateOtherField('xyz'));

      expect(whatFieldChanged(efStore.state, tracker)).toBeUndefined();

      store.dispatch(updateField('xyz'));

      expect(whatFieldChanged(efStore.state, tracker)).toMatchObject({
        field: sliceBField,
      });
    });

    describe('cleanup', () => {
      test('executes all cleanup callbacks on destroy', () => {
        const {
          efStore,
          store,
          sliceA,
          sliceB,
          sliceBField,
          sliceBOtherField,
        } = setup();

        const cleanup = jest.fn(async () => {});
        efStore._addCleanup(cleanup);
        expect(cleanup).toBeCalledTimes(0);

        efStore._destroy();
        expect(cleanup).toBeCalledTimes(1);

        // if called again, it should not be called again

        efStore._destroy();
        expect(cleanup).toBeCalledTimes(1);
      });

      test('should call callbacks only once', () => {
        const {
          efStore,
          store,
          sliceA,
          sliceB,
          sliceBField,
          sliceBOtherField,
        } = setup();

        const cleanup = jest.fn(async () => {});
        efStore._addCleanup(cleanup);

        efStore._destroy();
        efStore._destroy();
        efStore._destroy();

        expect(cleanup).toBeCalledTimes(1);
      });

      test('should run callback immediately if added after destroy', () => {
        const {
          efStore,
          store,
          sliceA,
          sliceB,
          sliceBField,
          sliceBOtherField,
        } = setup();

        const cleanup = jest.fn(async () => {});

        efStore._destroy();
        efStore._addCleanup(cleanup);
        expect(cleanup).toBeCalledTimes(1);
      });
    });
  });
});

describe('EffectStore', () => {
  const key = createKey('foo', []);
  const fieldA = key.field('a');
  const fieldB = key.field('b');
  const slice = key.slice({
    fieldA,
    fieldB,
  });

  const setup = ({ slices }: { slices?: Slice[] } = {}) => {
    const store = createStore({
      autoStartEffects: false,
      slices: slices || [],
    });

    const tracker: FieldTracker[] = [];
    const effectConfig = createEffectConfig(() => {});
    const effectTracker = new EffectTracker(tracker);
    const cleanups: EffectCleanupCallback[] = [];
    let effectStore = new EffectStore(store, effectTracker, cleanups);

    return {
      store,
      tracker,
      effectStore,
      cleanups,
    };
  };

  test('_addTrackField should add field to internal tracker', () => {
    const { effectStore, tracker } = setup({
      slices: [slice],
    });

    const trackedField: FieldTracker = {
      field: fieldA,
      value: 'some-value',
    };
    effectStore._addTrackField(trackedField);
    expect(tracker).toContain(trackedField);

    const trackedField2: FieldTracker = {
      field: fieldB,
      value: 'some-value-2',
    };
    effectStore._addTrackField(trackedField2);
    expect(tracker).toContain(trackedField2);
  });

  test('_addCleanup should add cleanup function to internal tracker', () => {
    const { effectStore, tracker, cleanups } = setup({
      slices: [slice],
    });

    const cleanupFunction = jest.fn<EffectCleanupCallback>(() => {});
    effectStore._addCleanup(cleanupFunction);
    expect(cleanups).toContain(cleanupFunction);
  });

  test('_destroy should clean up and mark store as destroyed', () => {
    const { effectStore, tracker, cleanups } = setup({
      slices: [slice],
    });

    const cleanupFunction = jest.fn<EffectCleanupCallback>(() => {});
    effectStore._addCleanup(cleanupFunction);

    const trackedField: FieldTracker = {
      field: fieldA,
      value: 'some-value',
    };
    effectStore._addTrackField(trackedField);

    effectStore._destroy();

    expect(cleanupFunction).toHaveBeenCalled();
    expect(cleanups).toHaveLength(0);

    cleanupFunction.mockClear();
    effectStore._destroy(); // Second destruction

    // tracker shouldn't be affected
    expect(tracker).toHaveLength(1);
    expect(cleanupFunction).not.toHaveBeenCalled();
  });
});
