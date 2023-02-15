export const TX_META_DISPATCH_SOURCE = 'DEBUG_DISPATCH_SOURCE';
export const TX_META_STORE_TX_ID = 'store-tx-id';
export const TX_META_STORE_NAME = 'store-name';
export const TX_META_CHANGE_KEY = 'TX_META_CHANGE_KEY';

export class Transaction<K extends string, P extends unknown[]> {
  public metadata = new Metadata();

  constructor(
    public readonly sliceKey: K,
    public readonly payload: P,
    public readonly actionId: string,
  ) {}

  changeKey(key: string): Transaction<string, P> {
    const tx = new Transaction(key, this.payload, this.actionId);
    tx.metadata = this.metadata.fork();

    tx.metadata.appendMetadata(
      TX_META_CHANGE_KEY,
      `changeKey(${this.sliceKey} -> ${key})`,
    );

    return tx;
  }
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
    dispatcher: tx.metadata.getMetadata(TX_META_DISPATCH_SOURCE),
    store: tx.metadata.getMetadata(TX_META_STORE_NAME),
    txId: tx.metadata.getMetadata(TX_META_STORE_TX_ID),
    payload: tx.payload,
  };
}

export type LogItem = EffectLog | TransactionLog;

export type DebugFunc = (item: LogItem) => void;
