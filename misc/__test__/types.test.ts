import { expect, test } from '@jest/globals';
import { createKey } from '@nalanda/core';

test('test', () => {
  const dep1Key = createKey('dep1Key', []);
  const dep1Slice = dep1Key.slice({
    fields: {},
  });

  const dep2Key = createKey('dep2Key', []);
  const dep2Slice = dep2Key.slice({
    fields: {},
  });

  const key = createKey('myKey', [dep1Slice, dep2Slice]);

  const field1 = key.field(1);

  const mySlice = key.slice({
    fields: {},
  });

  expect(1).toBe(1);
});
