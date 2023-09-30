import type { ActionId, SliceId } from '../types';
import { createSliceId } from './create-ids';

type InternalIdGenerators = {
  txCounter: number;
  actionIdCounters: Record<SliceId, number>;
  sliceIdCounters: Record<string, number>;
};

const internalInitState: () => InternalIdGenerators = () => ({
  txCounter: 0,
  actionIdCounters: Object.create(null),
  sliceIdCounters: Object.create(null),
});

let idGenerators = internalInitState();

/**
 * Should only be used in tests, to avoid side effects between tests
 */
export const testOnlyResetIdGeneration = () => {
  idGenerators = internalInitState();
};

class IdGeneration {
  createActionId(sliceId: SliceId, hint = ''): ActionId {
    let prefix = `a_${hint}[${sliceId}]`;

    if (sliceId in idGenerators.actionIdCounters) {
      return `${prefix}${idGenerators.actionIdCounters[sliceId]++}` as ActionId;
    } else {
      idGenerators.actionIdCounters[sliceId] = 0;

      return prefix as ActionId;
    }
  }

  createSliceId(name: string): SliceId {
    if (name in idGenerators.sliceIdCounters) {
      return createSliceId(
        `sl_${name}$${++idGenerators.sliceIdCounters[name]}`,
      );
    }

    idGenerators.sliceIdCounters[name] = 0;

    return createSliceId(`sl_${name}$`);
  }

  createTransactionId(): string {
    return `tx_${idGenerators.txCounter++}`;
  }
}

export const idGeneration = new IdGeneration();
