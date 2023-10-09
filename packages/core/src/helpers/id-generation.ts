import type { FieldId, SliceId } from '../types';

const resetSymbol = Symbol('reset');

function createIdGenerator<T>(prefix: string) {
  let counterMap: Record<string, number> = Object.create(null);

  return {
    // only for testing
    [resetSymbol]: () => {
      counterMap = Object.create(null);
    },
    generate: (name: string): T => {
      if (name in counterMap) {
        return `${prefix}_${name}$${++counterMap[name]}` as T;
      } else {
        counterMap[name] = 0;
        return `${prefix}_${name}$` as T;
      }
    },
  };
}

let txCounter = 0;

export const fieldIdCounters = createIdGenerator<FieldId>('f');
export const sliceIdCounters = createIdGenerator<SliceId>('sl');
export const genTransactionID = () => `tx_${txCounter++}`;
export const genStoreId = createIdGenerator<string>('store');

/**
 * WARNING Should only be used in tests, to avoid side effects between tests
 */
export const testOnlyResetIdGeneration = () => {
  fieldIdCounters[resetSymbol]();
  sliceIdCounters[resetSymbol]();
  genStoreId[resetSymbol]();
  txCounter = 0;
};
