import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import { createKey } from '../../slice/key';
import { StoreState } from '../../store-state';

import { testCleanup } from '../../helpers/test-cleanup';
import { FieldTracker } from '../types';
import { doesTrackSlice, whatFieldChanged } from '../utils';
import { EffectStore } from '../effect-store';

beforeEach(() => {
  testCleanup();
});

describe('whatFieldChanged', () => {
  const key = createKey('foo', []);
  const fieldA = key.field('a');
  const fieldB = key.field('b');
  const slice = key.slice({
    fieldA,
    fieldB,
  });

  test('should return undefined if not tracker', () => {
    let state = StoreState.create({
      slices: [slice],
    });

    expect(whatFieldChanged(state, [])).toBe(undefined);
  });

  test('should return field that changed', () => {
    let state = StoreState.create({
      slices: [slice],
    });

    const trackedField: FieldTracker[] = [
      {
        field: fieldA,
        value: 'some-other-val',
      },
    ];
    expect(whatFieldChanged(state, trackedField)).toMatchObject({
      newVal: 'a',
      oldVal: 'some-other-val',
    });

    expect(whatFieldChanged(state, trackedField)?.field).toBe(fieldA);
  });

  test('should check for equality', () => {
    let state = StoreState.create({
      slices: [slice],
    });

    const trackedField: FieldTracker[] = [
      {
        field: fieldA,
        value: 'a',
      },
    ];
    expect(whatFieldChanged(state, trackedField)).toBe(undefined);
  });

  test('should respect custom equality', () => {
    const key = createKey('mySlice', []);
    const fieldObjA = key.field({ a: 'a' }, { equal: (a, b) => a.a === b.a });
    const fieldObjB = key.field({ b: 'b' });

    const mySlice = key.slice({
      fieldObjA,
    });

    let state = StoreState.create({
      slices: [slice, mySlice],
    });

    const trackedField: FieldTracker[] = [
      {
        field: fieldObjA,
        value: { a: 'a' },
      },
    ];
    expect(whatFieldChanged(state, trackedField)).toBe(undefined);

    const trackedField2: FieldTracker[] = [
      {
        field: fieldObjA,
        value: { a: 'a' },
      },
      {
        field: fieldObjB,
        // this field doesn't have a custom equality function
        // so it will be treated as not equal
        value: { b: 'b' },
      },
    ];

    expect(whatFieldChanged(state, trackedField2)?.field).toBe(fieldObjB);
  });

  test('should return the first changed field when multiple fields changed', () => {
    let state = StoreState.create({
      slices: [slice],
    });

    const trackedFields: FieldTracker[] = [
      {
        field: fieldA,
        value: 'old-val-a',
      },
      {
        field: fieldB,
        value: 'old-val-b',
      },
    ];
    expect(whatFieldChanged(state, trackedFields)?.field).toBe(fieldA);
  });

  test('should handle empty state', () => {
    let state = StoreState.create({ slices: [] });

    const trackedField: FieldTracker[] = [
      {
        field: fieldA,
        value: 'some-value',
      },
    ];
    expect(() => whatFieldChanged(state, trackedField)).toThrowError(
      /does not exist/,
    );
  });

  test('should handle field declared later', () => {
    const nonExistentField = key.field('c');
    let state = StoreState.create({
      slices: [slice],
    });

    const trackedField: FieldTracker[] = [
      {
        field: nonExistentField,
        value: 'some-value',
      },
    ];
    expect(whatFieldChanged(state, trackedField)?.field).toBeDefined();
  });
});

describe('does trackSlice', () => {
  const key = createKey('foo', []);
  const fieldA = key.field('a');
  const fieldB = key.field('b');
  const slice = key.slice({
    fieldA,
    fieldB,
  });

  test('should return true when a tracker does track a slice', () => {
    const sliceSet = new Set([slice]);
    const trackedField: FieldTracker[] = [
      {
        field: fieldA,
        value: 'some-value',
      },
    ];

    expect(doesTrackSlice(sliceSet, trackedField)).toBe(true);
  });

  test('should return false when a tracker does not track any slice', () => {
    const key2 = createKey('bar', []);
    const anotherSlice = key2.slice({ anotherField: key2.field('c') });
    const sliceSet = new Set([anotherSlice]);

    const trackedField: FieldTracker[] = [
      {
        field: fieldA,
        value: 'some-value',
      },
    ];

    expect(doesTrackSlice(sliceSet, trackedField)).toBe(false);
  });

  test('should return true when one of the trackers does track a slice among multiple slices', () => {
    const key2 = createKey('bar', []);
    const anotherField = key2.field('c');
    const anotherSlice = key2.slice({ anotherField });
    const sliceSet = new Set([slice, anotherSlice]);

    const trackedFields: FieldTracker[] = [
      {
        field: fieldA,
        value: 'some-value',
      },
      {
        field: anotherField,
        value: 'another-value',
      },
    ];

    expect(doesTrackSlice(sliceSet, trackedFields)).toBe(true);
  });

  test('should return false when there are no field trackers', () => {
    const sliceSet = new Set([slice]);

    expect(doesTrackSlice(sliceSet, [])).toBe(false);
  });

  test('should return false when there are no slices', () => {
    const trackedField: FieldTracker[] = [
      {
        field: fieldA,
        value: 'some-value',
      },
    ];

    expect(doesTrackSlice(new Set(), trackedField)).toBe(false);
  });
});
