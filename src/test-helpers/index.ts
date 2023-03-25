import { createSlice } from '../vanilla';
import { createSliceKey } from '../vanilla/internal-types';
import type {
  ActionBuilder,
  AnyEffect,
  AnySlice,
  BareStore,
  Effect,
} from '../vanilla/public-types';
import { Slice } from '../vanilla/slice';
import { DispatchTx } from '../vanilla/store';
import {
  LogItem,
  Transaction,
  TX_META_DISPATCH_SOURCE,
} from '../vanilla/transaction';

/**
 * To be only used for testing scenarios. In production, slices should never be able
 * to override their dependencies.
 */
export function testOverrideDependencies<SL extends AnySlice>(
  slice: SL,
  {
    dependencies = slice.spec.dependencies,
  }: {
    // since this is for testing, we can allow any slice
    dependencies?: AnySlice[];
  },
): SL {
  return slice._fork({
    dependencies,
  }) as any;
}

export function waitUntil<B extends BareStore<any>>(
  store: B,
  condition: (state: B['state']) => boolean,
  waitUntil = 100,
  pollFrequency = 5,
): Promise<B['state']> {
  let interval: ReturnType<typeof setInterval> | undefined;
  let timeout: ReturnType<typeof setTimeout> | undefined;

  return new Promise<B['state']>((resolve, reject) => {
    timeout = setTimeout(() => {
      clearInterval(interval);
      reject(new Error('Timeout condition not met'));
    }, waitUntil);

    interval = setInterval(() => {
      if (condition(store.state)) {
        clearTimeout(timeout);
        clearInterval(interval);
        resolve(store.state);
      }
    }, pollFrequency);
  });
}

export function createDispatchSpy(fn?: (tx: Transaction<any, any>) => void) {
  let txs: Transaction<any, any>[] = [];
  const dispatch: DispatchTx<Transaction<any, any>> = (store, tx) => {
    let newState = store.state.applyTransaction(tx);
    fn?.(tx);
    txs.push(tx);
    store.updateState(newState, tx);
  };
  let logItems: LogItem[] = [];
  return {
    debug: (log: LogItem) => {
      if (log.type === 'TX') {
        logItems.push({ ...log, txId: '<txId>' });
        return;
      }
      logItems.push(log);
    },
    getDebugLogItems() {
      return logItems;
    },
    dispatch,
    getTransactions() {
      return txs;
    },
    getSimplifiedTransactions({
      filterBySource,
    }: {
      hideInternal?: boolean;
      filterBySource?: AnySlice | AnySlice[];
    } = {}) {
      return txs

        .filter((r) => {
          return !filterBySource
            ? true
            : [filterBySource]
                .flatMap((s) => s)
                .some((s) => r.sourceSliceKey == createSliceKey(s.name));
        })
        .map(
          ({ sourceSliceKey, targetSliceKey, metadata, payload, config }) => ({
            sourceSliceKey,
            targetSliceKey,
            actionId: config.actionId,
            payload,
            dispatchSource: metadata.getMetadata(TX_META_DISPATCH_SOURCE),
          }),
        );
    },
  };
}
