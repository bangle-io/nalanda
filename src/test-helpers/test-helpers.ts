import { Transaction } from '../vanilla';
import { AnySlice } from '../vanilla/slice';
import { DispatchTx, ReducedStore, Store } from '../vanilla/store';
import { LogItem, TX_META_DISPATCHER } from '../vanilla/transaction';

export function testOverrideDependencies<SL extends AnySlice>(
  slice: SL,
  dependencies: AnySlice[] = slice.spec.dependencies,
  cloneSpec = false,
): SL {
  let spec = slice.spec;
  if (cloneSpec) {
    spec = { ...spec };
  }
  (spec as any).dependencies = dependencies;

  (slice as any).spec = spec;

  return slice;
}

export function waitUntil<TStore extends ReducedStore<any> | Store<any>>(
  store: TStore,
  condition: (state: TStore['state']) => boolean,
  waitUntil = 100,
  pollFrequency = 5,
): Promise<TStore['state']> {
  let interval: ReturnType<typeof setInterval> | undefined;
  let timeout: ReturnType<typeof setTimeout> | undefined;

  return new Promise<TStore['state']>((resolve, reject) => {
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
    Store.updateState(store, newState, tx);
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
                .some((s) => r.sourceSliceLineage == s.spec.lineageId);
        })
        .map(
          ({
            sourceSliceLineage,
            metadata,
            payload,
            config,
            targetSliceLineage,
          }) => ({
            sourceSliceLineage,
            actionId: config.actionId,
            payload,
            dispatchSource: metadata.getMetadata(TX_META_DISPATCHER),
            targetSliceLineage,
          }),
        );
    },
  };
}
