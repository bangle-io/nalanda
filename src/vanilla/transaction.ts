import { uuid } from './helpers';
import { LineageId } from './internal-types';

const contextId = uuid(5);
let counter = 0;

function incrementalId() {
  return `tx_${contextId}-${counter++}`;
}

export const TX_META_DISPATCHER = 'TX_META_DISPATCHER';
export const TX_META_DISPATCH_INFO = 'TX_META_DISPATCH_INFO';
export const TX_META_STORE_NAME = 'TX_META_STORE_NAME';
export const TX_META_DESERIALIZED_FROM = 'TX_META_DESERIALIZED_FROM';
export const TX_META_DESERIALIZED_META = 'TX_META_DESERIALIZED_META';
export const TX_META_CHANGE_LINEAGE = 'TX_META_CHANGE_LINEAGE';

export class Transaction<N extends string, P extends unknown[]> {
  public metadata = new Metadata();

  public readonly sourceSliceLineage: LineageId;
  public readonly targetSliceLineage: LineageId;
  public readonly payload: P;
  public readonly actionId: string;
  public readonly uid = incrementalId();

  toJSONObj(payloadSerializer: (payload: unknown[]) => string) {
    return {
      sourceSliceLineage: this.sourceSliceLineage,
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
    debugInfo?: string,
  ) {
    let tx = new Transaction({
      sourceSliceLineage: obj.sourceSliceLineage,
      targetSliceLineage: obj.targetSliceLineage,
      sourceSliceName: obj.sourceSliceName,
      payload: payloadParser(obj.payload),
      actionId: obj.actionId,
    });
    tx.metadata = Metadata.fromJSONObj(obj.metadata);
    tx.metadata.appendMetadata(TX_META_DESERIALIZED_FROM, obj.uid);

    if (debugInfo) {
      tx.metadata.appendMetadata(TX_META_DESERIALIZED_META, debugInfo);
    }

    return tx;
  }

  constructor(
    public readonly config: {
      sourceSliceLineage?: LineageId | undefined;
      sourceSliceName: N;
      targetSliceLineage: LineageId;
      payload: P;
      actionId: string;
    },
  ) {
    this.targetSliceLineage = config.targetSliceLineage;
    this.sourceSliceLineage =
      config.sourceSliceLineage || config.targetSliceLineage;
    this.payload = config.payload;
    this.actionId = config.actionId;
  }

  change({
    targetSliceLineage,
    sourceSliceLineage,
  }: {
    targetSliceLineage: LineageId;
    sourceSliceLineage?: LineageId;
  }): Transaction<N, P> {
    const tx = new Transaction({
      ...this.config,
      targetSliceLineage,
      sourceSliceLineage: sourceSliceLineage,
    });
    tx.metadata = this.metadata.fork();

    tx.metadata.appendMetadata(
      TX_META_CHANGE_LINEAGE,
      `target ${this.targetSliceLineage} -> ${targetSliceLineage}` +
        (sourceSliceLineage
          ? ` source ${this.sourceSliceLineage} -> ${sourceSliceLineage}`
          : ''),
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
  source: Array<{ lineageId: LineageId; actionId: string }>;
}

export interface TransactionLog {
  type: 'TX';
  sourceSliceLineage: LineageId;
  targetSliceLineage: LineageId;
  actionId: string;
  dispatcher?: string;
  dispatchInfo?: string;
  store?: string;
  txId: string;
  payload: unknown[];
}

export function txLog(tx: Transaction<any, any>): TransactionLog {
  return Object.fromEntries(
    Object.entries({
      type: 'TX',
      sourceSliceLineage: tx.sourceSliceLineage,
      targetSliceLineage: tx.targetSliceLineage,
      actionId: tx.config.actionId,
      dispatcher: tx.metadata.getMetadata(TX_META_DISPATCHER),
      dispatchInfo: tx.metadata.getMetadata(TX_META_DISPATCH_INFO),
      store: tx.metadata.getMetadata(TX_META_STORE_NAME),
      txId: tx.uid,
      payload: tx.payload,
    }).filter((r) => r[1] !== undefined),
  ) as any;
}

export type LogItem = EffectLog | TransactionLog;

export type DebugFunc = (item: LogItem) => void;
