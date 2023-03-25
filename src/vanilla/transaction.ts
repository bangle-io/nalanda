import { uuid } from './helpers';
import {
  createSliceNameOpaque,
  LineageId,
  SliceKey,
  SliceNameOpaque,
} from './internal-types';

const contextId = uuid(4);
let counter = 0;

function incrementalId() {
  return `tx_${contextId}-${counter++}`;
}

export const TX_META_DISPATCH_SOURCE = 'DEBUG_DISPATCH_SOURCE';
export const TX_META_STORE_NAME = 'store-name';
export const TX_META_DESERIALIZED_FROM = 'TX_META_DESERIALIZED_FROM';
export const TX_META_DESERIALIZED_META = 'TX_META_DESERIALIZED_META';
export const TX_META_CHANGE_KEY = 'TX_META_CHANGE_KEY';

export class Transaction<N extends string, P extends unknown[]> {
  public metadata = new Metadata();

  public readonly sourceSliceKey: SliceKey;
  public readonly targetSliceKey: SliceKey;
  public readonly targetSliceName: SliceNameOpaque;
  public readonly targetSliceLineage: LineageId;
  public readonly payload: P;
  public readonly actionId: string;
  public readonly uid = incrementalId();

  toJSONObj(payloadSerializer: (payload: unknown[]) => string) {
    return {
      sourceSliceKey: this.sourceSliceKey,
      targetSliceKey: this.targetSliceKey,
      targetSliceName: this.targetSliceName,
      targetSliceLineage: this.targetSliceLineage,
      sourceSliceName: this.config.sourceSliceName,
      payload: payloadSerializer(this.payload),
      actionId: this.actionId,
      uid: this.uid,
      metadata: this.metadata.toJSONObj(),
    };
  }

  static fromJSONObj(
    obj: ReturnType<Transaction<any, any>['toJSONObj']>,
    payloadParser: (payload: string) => unknown[],
    info?: string,
  ) {
    let tx = new Transaction({
      sourceSliceKey: obj.sourceSliceKey,
      targetSliceKey: obj.targetSliceKey,
      targetSliceName: obj.targetSliceName,
      targetSliceLineage: obj.targetSliceLineage,
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
    // source and target slice key are the same by default
    // 'source' means the slice that created the transaction
    /// for ex slice1.actions.foo() -> slice1 is the source
    //  most of the time, the source and target are the same
    // but sometimes in merging, the source and target are different
    public readonly config: {
      // TODO: remove sourceSliceKey ? See store.ts reduced store TODO
      sourceSliceKey: SliceKey;
      sourceSliceName: N;
      targetSliceLineage: LineageId;
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

    this.targetSliceLineage = config.targetSliceLineage;

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
    txId: tx.uid,
    payload: tx.payload,
  };
}

export type LogItem = EffectLog | TransactionLog;

export type DebugFunc = (item: LogItem) => void;
