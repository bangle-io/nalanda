import { ActionId, SliceId, uuid } from './helpers';
import { idGeneration } from './id_generation';

type TransactionOpts<TSliceName extends string, TParams extends any[]> = {
  name: TSliceName;
  params: TParams;
  actionId: ActionId;
  sourceSliceName: string;
  sourceSliceId: SliceId;
  targetSliceName: TSliceName;
  targetSliceId: SliceId;
};

export const TX_META_DISPATCH_SOURCE = 'DEBUG_DISPATCH_SOURCE';
export const TX_META_STORE_TX_ID = 'store-tx-id';
export const TX_META_STORE_NAME = 'store-name';

let txCounter = 0;

export class Transaction<TSliceName extends string, TParams extends unknown[]> {
  public metadata = new Metadata();

  readonly txId = idGeneration.createTransactionId();

  static create<TSliceName extends string, TParams extends unknown[]>(opts: {
    name: TSliceName;
    params: TParams;
    actionId: ActionId;
    sourceSliceName: string;
    sourceSliceId: SliceId;
  }) {
    return new Transaction<TSliceName, TParams>({
      ...opts,
      targetSliceName: opts.name,
      targetSliceId: opts.sourceSliceId,
    });
  }

  private constructor(
    public readonly opts: TransactionOpts<TSliceName, TParams>,
  ) {}
}

export class Metadata {
  private _metadata: Record<string, string> = Object.create(null);

  appendMetadata(key: string, val: string) {
    let existing = this.getMetadata(key);
    this.setMetadata(key, existing ? existing + ',' + val : val);
  }

  getMetadata(key: string) {
    return this._metadata[key];
  }

  setMetadata(key: string, val: string) {
    this._metadata[key] = val;
  }

  fork(): Metadata {
    const meta = new Metadata();
    meta._metadata = { ...this._metadata };
    return meta;
  }
}

export interface EffectLog {
  type: 'SYNC_UPDATE_EFFECT' | 'UPDATE_EFFECT';
  name: string;
  source: Array<{ sliceId: string; actionId: ActionId }>;
}

export interface TransactionLog {
  type: 'TX';
  actionId: ActionId;
  sourceSliceName: string;
  sourceSliceId: SliceId;
  targetSliceName: string;
  targetSliceId: SliceId;
  dispatcher: string | undefined;
  store: string | undefined;
  txId: string | undefined;
  params: unknown[];
}

export function txLog(tx: Transaction<any, any>): TransactionLog {
  return {
    type: 'TX',
    sourceSliceName: tx.opts.sourceSliceName,
    targetSliceName: tx.opts.targetSliceName,
    sourceSliceId: tx.opts.sourceSliceId,
    targetSliceId: tx.opts.sourceSliceId,
    actionId: tx.opts.actionId,
    dispatcher: tx.metadata.getMetadata(TX_META_DISPATCH_SOURCE),
    store: tx.metadata.getMetadata(TX_META_STORE_NAME),
    txId: tx.metadata.getMetadata(TX_META_STORE_TX_ID),
    params: tx.opts.params,
  };
}

export type LogItem = EffectLog | TransactionLog;

export type DebugFunc = (item: LogItem) => void;
