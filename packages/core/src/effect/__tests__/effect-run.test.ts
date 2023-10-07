import { expect, jest, test, describe, beforeEach } from '@jest/globals';
import { testCleanup } from '../../helpers/test-cleanup';
import { createKey } from '../../slice/key';
import { EffectRun } from '../effect-run';
import { createStore } from '../../store';

const setup = () => {
  const sliceAKey = createKey('slice1', []);
  const fooField = sliceAKey.field('bar');
  const sliceA = sliceAKey.slice({
    fields: {
      foo: fooField,
    },
  });

  const sliceBKey = createKey('slice2', []);
  const sliceBField = sliceBKey.field('bar');
  const sliceBOtherField = sliceBKey.field('bizz');
  const sliceB = sliceBKey.slice({
    fields: {
      sliceBField: sliceBField,
      sliceBOtherField: sliceBOtherField,
    },
  });

  const store = createStore({
    name: 'test',
    slices: [sliceA, sliceB],
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

beforeEach(() => {
  testCleanup();
});

describe('EffectRun', () => {
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
      const { store, sliceA, sliceB, sliceBField, sliceBOtherField } = setup();

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
      const { store, sliceA, sliceB, sliceBField, sliceBOtherField } = setup();

      let runInstance1 = new EffectRun(store, 'test');
      const cleanup = jest.fn(async () => {});
      runInstance1.addCleanup(cleanup);

      runInstance1.destroy();
      runInstance1.destroy();
      runInstance1.destroy();

      expect(cleanup).toBeCalledTimes(1);
    });

    test('should run callback immediately if added after destroy', () => {
      const { store, sliceA, sliceB, sliceBField, sliceBOtherField } = setup();

      let runInstance1 = new EffectRun(store, 'test');
      const cleanup = jest.fn(async () => {});

      runInstance1.destroy();
      runInstance1.addCleanup(cleanup);
      expect(cleanup).toBeCalledTimes(1);
    });
  });
});
