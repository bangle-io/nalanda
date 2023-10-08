import { describe, expect, test } from '@jest/globals';
import { Store, createKey } from '@nalanda/core';
import { useTrack, useTrackField } from '../react';
import { expectType } from '../types';

describe('hooks types', () => {
  const mySliceKey = createKey('mySlice', []);
  const aField = mySliceKey.field(1);
  const bField = mySliceKey.field('string-val');

  const derivedField = mySliceKey.derive(() => {
    return {
      hello: 'test',
    };
  });

  //   NOTE: string search action names in this file source code if you want to rename them
  function incrementAField(fakeInput: number) {
    return aField.update((a) => a + 1);
  }

  function decrementAField(fakeInput: string) {
    return aField.update((a) => a - 1);
  }

  const mySlice = mySliceKey.slice({
    a: aField,
    b: bField,
    derivedField,
    incrementAField,
    decrementAField,
  });

  const mySlice2Key = createKey('mySlice2', [mySlice]);
  const aField2 = mySlice2Key.field(1);
  const mySlice2 = mySlice2Key.slice({
    a: aField2,
  });

  test('useTrack', () => {
    () => {
      const result = useTrack(mySlice, {} as Store<any>);
      expectType<
        {
          a: number;
          b: string;
          derivedField: {
            hello: string;
          };
        },
        typeof result
      >(result);
    };

    expect(1).toBe(1);
  });

  test('useTrackField', () => {
    () => {
      const a = useTrackField(mySlice, 'a', {} as Store<any>);
      expectType<number, typeof a>(a);
    };

    () => {
      const b = useTrackField(mySlice, 'b', {} as Store<any>);
      expectType<string, typeof b>(b);
    };

    () => {
      const der = useTrackField(mySlice, 'derivedField', {} as Store<any>);
      expectType<
        {
          hello: string;
        },
        typeof der
      >(der);
    };

    () => {
      // @ts-expect-error action is not a field should fail
      useTrackField(mySlice, 'incrementAField', {} as Store<any>);
    };

    expect(1).toBe(1);
  });

  test('actions types', () => {
    () => {
      mySlice.actions.decrementAField('test');
    };
    expect(1).toBe(1);
  });
});
