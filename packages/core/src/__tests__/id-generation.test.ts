import { beforeEach, describe, expect, it } from '@jest/globals';
import { testCleanup } from '../helpers/test-cleanup';
import { genTransactionID, sliceIdCounters } from '../helpers/id-generation';

beforeEach(() => {
  testCleanup();
});

describe('genTransactionID', () => {
  it('should generate unique transaction IDs', () => {
    const id1 = genTransactionID();
    const id2 = genTransactionID();
    const id3 = genTransactionID();

    expect(id1).not.toEqual(id2);
    expect(id1).toMatchInlineSnapshot(`"tx_0"`);
    expect(id3).toMatchInlineSnapshot(`"tx_2"`);
  });
});

describe('sliceIdCounters.generate', () => {
  it('should generate unique slice IDs for different names', () => {
    const id1 = sliceIdCounters.generate('mySlice');
    const id2 = sliceIdCounters.generate('mySlice2');
    const id3 = sliceIdCounters.generate('mySlice3');

    expect(id1).not.toEqual(id2);
    expect(id1).not.toEqual(id3);
    expect(id2).not.toEqual(id3);
    expect(id1).toMatchInlineSnapshot(`"sl_mySlice$"`);
    expect(id2).toMatchInlineSnapshot(`"sl_mySlice2$"`);
    expect(id3).toMatchInlineSnapshot(`"sl_mySlice3$"`);
  });
});
