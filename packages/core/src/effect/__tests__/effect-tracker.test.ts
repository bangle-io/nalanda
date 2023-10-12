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

describe('EffectTracker', () => {
  const sliceAKey = createKey('slice1', []);
  const fooField = sliceAKey.field('bar');
  const sliceA = sliceAKey.slice({
    foo: fooField,
  });

  test('checks if the trackers of an effect track any of the slices provided', () => {
    const effectTracker = new EffectTracker([]);

    const sliceSet = new Set([sliceA]);

    const result = effectTracker.doesTrackSlice(sliceSet);

    expect(result).toBe(false);
  });

  test('checks if the trackers of an effect track any of the slices provided: 2', () => {
    const effectTracker = new EffectTracker([
      {
        field: fooField,
        value: 'some-other-val',
      },
    ]);

    const sliceSet = new Set([sliceA]);

    const result = effectTracker.doesTrackSlice(sliceSet);

    expect(result).toBe(true);
  });

  test('checks if the trackers of an effect track any of the slices provided', () => {
    const effectTracker = new EffectTracker([]);
    const sliceSet = new Set([sliceA]);
    const result = effectTracker.doesTrackSlice(sliceSet);
    expect(result).toBe(false);
  });

  test('clears the tracker array', () => {
    const effectTracker = new EffectTracker([
      { field: fooField, value: 'some-val' },
    ]);
    effectTracker.clearTracker();
    const resultAfterClear = effectTracker.doesTrackSlice(new Set([sliceA]));
    expect(resultAfterClear).toBe(false);
  });

  test('adds a tracker and checks if it tracks slice', () => {
    const effectTracker = new EffectTracker([]);
    effectTracker.addTracker({ field: fooField, value: 'some-val' });
    const result = effectTracker.doesTrackSlice(new Set([sliceA]));
    expect(result).toBe(true);
  });

  test('does not add a tracker if destroyed', () => {
    const effectTracker = new EffectTracker([]);
    effectTracker.destroy();
    effectTracker.addTracker({ field: fooField, value: 'some-val' });
    const result = effectTracker.doesTrackSlice(new Set([sliceA]));
    expect(result).toBe(false);
  });

  test('checks what field changed', () => {
    const effectTracker = new EffectTracker([
      { field: fooField, value: 'some-val' },
    ]);

    const store = createStore({
      autoStartEffects: true,
      name: 'test',
      slices: [sliceA],
      overrides: {},
    });
    const result = effectTracker.whatFieldChanged(store.state);

    expect(result?.field).toBe(fooField);
  });

  test('returns undefined if no trackers are present', () => {
    const effectTracker = new EffectTracker([]);
    const store = createStore({
      autoStartEffects: true,
      name: 'test',
      slices: [sliceA],
      overrides: {},
    });
    const result = effectTracker.whatFieldChanged(store.state);
    expect(result).toBeUndefined();
  });

  test('destroys the effect tracker', () => {
    const effectTracker = new EffectTracker([]);
    effectTracker.destroy();
    const resultAfterDestroy = effectTracker.doesTrackSlice(new Set([sliceA]));
    expect(resultAfterDestroy).toBe(false);
  });
});
