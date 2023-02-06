import type { Transaction } from './transaction';
import {
  TX_META_DISPATCH_SOURCE,
  TX_META_STORE_NAME,
  TX_META_STORE_TX_ID,
} from './transaction';

export interface EffectLog {
  type: 'EFFECT';
  name: string;
  source: Array<{ sliceKey: string; actionId: string }>;
}
export interface TransactionLog {
  type: 'TX';
  slice: string;
  actionId: string;
  dispatcher: string | undefined;
  store: string | undefined;
  txId: string | undefined;
  payload: unknown[];
}

export function txLog(tx: Transaction<any, any>): TransactionLog {
  return {
    type: 'TX',
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    slice: tx.sliceKey,
    actionId: tx.actionId,
    dispatcher: tx.getMetadata(TX_META_DISPATCH_SOURCE),
    store: tx.getMetadata(TX_META_STORE_NAME),
    txId: tx.getMetadata(TX_META_STORE_TX_ID),
    payload: tx.payload,
  };
}

export type LogItem = EffectLog | TransactionLog;

export type DebugFunc = (item: LogItem) => void;
