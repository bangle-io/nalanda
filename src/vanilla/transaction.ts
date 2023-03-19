import { uuid } from './helpers';
import {
  createSliceNameOpaque,
  SliceKey,
  SliceNameOpaque,
} from './internal-types';

export const TX_META_DISPATCH_SOURCE = 'DEBUG_DISPATCH_SOURCE';
export const TX_META_STORE_TX_ID = 'store-tx-id';
export const TX_META_STORE_NAME = 'store-name';
export const TX_META_CHANGE_KEY = 'TX_META_CHANGE_KEY';
export const TX_META_DESERIALIZED_FROM = 'TX_META_DESERIALIZED_FROM';
export const TX_META_DESERIALIZED_META = 'TX_META_DESERIALIZED_META';

export class Transaction<N extends string, P extends unknown[]> {
  public metadata = new Metadata();

  public readonly sourceSliceKey: SliceKey;
  public readonly targetSliceKey: SliceKey;
  public readonly targetSliceName: SliceNameOpaque;
  public readonly payload: P;
  public readonly actionId: string;
  public readonly uid = 'txn_' + uuid();

  toJSONObj(payloadSerializer: (payload: P) => unknown) {
    return {
      sourceSliceKey: this.sourceSliceKey,
      targetSliceKey: this.targetSliceKey,
      targetSliceName: this.targetSliceName,
      sourceSliceName: this.config.sourceSliceName,
      payload: payloadSerializer(this.payload),
      actionId: this.actionId,
      uid: this.uid,
      metadata: this.metadata.toJSONObj(),
    };
  }

  static fromJSONObj(
    obj: ReturnType<Transaction<any, any>['toJSONObj']>,
    payloadParser: (payload: any) => any,
    info?: string,
  ) {
    let tx = new Transaction({
      sourceSliceKey: obj.sourceSliceKey,
      targetSliceKey: obj.targetSliceKey,
      targetSliceName: obj.targetSliceName,
      sourceSliceName: obj.sourceSliceName,
      payload: payloadParser(obj.payload),
      actionId: obj.actionId,
    });
    tx.metadata = Metadata.fromJSONObj(obj.metadata);
    tx.metadata.appendMetadata(TX_META_DESERIALIZED_FROM, obj.uid);

    if (info) {
      tx.metadata.appendMetadata(TX_META_DESERIALIZED_META, info);
    }

    return tx;
  }

  constructor(
    public readonly config: {
      sourceSliceKey: SliceKey;
      sourceSliceName: N;
      targetSliceKey?: SliceKey;
      targetSliceName?: SliceNameOpaque;
      payload: P;
      actionId: string;
    },
  ) {
    this.sourceSliceKey = config.sourceSliceKey;
    this.targetSliceKey = config.targetSliceKey ?? config.sourceSliceKey;
    this.targetSliceName =
      config.targetSliceName ?? createSliceNameOpaque(config.sourceSliceName);

    this.payload = config.payload;
    this.actionId = config.actionId;
  }

  changeTargetSlice(key: SliceKey): Transaction<N, P> {
    if (this.targetSliceKey === key) {
      return this;
    }

    const originalTarget = this.targetSliceKey;
    const tx = new Transaction({
      ...this.config,
      targetSliceKey: key,
    });
    tx.metadata = this.metadata.fork();
    tx.metadata.appendMetadata(
      TX_META_CHANGE_KEY,
      `changeTargetKey(${originalTarget} -> ${key})`,
    );

    return tx;
  }
}

export class Metadata {
  private _metadata: Record<string, string> = Object.create(null);

  static fromJSONObj(obj: Record<string, string>) {
    let meta = new Metadata();
    meta._metadata = { ...obj };
    return meta;
  }

  toJSONObj() {
    return { ...this._metadata };
  }

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
  sourceSliceKey: SliceKey;
  targetSliceKey: SliceKey;
  actionId: string;
  dispatcher: string | undefined;
  store: string | undefined;
  txId: string | undefined;
  payload: unknown[];
}

export function txLog(tx: Transaction<any, any>): TransactionLog {
  return {
    type: 'TX',
    sourceSliceKey: tx.sourceSliceKey,
    targetSliceKey: tx.targetSliceKey,
    actionId: tx.config.actionId,
    dispatcher: tx.metadata.getMetadata(TX_META_DISPATCH_SOURCE),
    store: tx.metadata.getMetadata(TX_META_STORE_NAME),
    txId: tx.metadata.getMetadata(TX_META_STORE_TX_ID),
    payload: tx.payload,
  };
}

export type LogItem = EffectLog | TransactionLog;

export type DebugFunc = (item: LogItem) => void;
