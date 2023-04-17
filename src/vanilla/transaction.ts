import { StoreState } from '.';
import { uuid } from './helpers';
import { LineageId } from './internal-types';
import { Store } from './store';

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

export type JSONTransaction = ReturnType<Transaction<any, any>['toJSONObj']>;
export type PayloadSerializer<
  N extends string = string,
  P extends unknown[] = unknown[],
> = (payload: unknown[], tx: Transaction<N, P>) => unknown;

export type PayloadParser = (
  payload: unknown,
  obj: JSONTransaction,
  store: Store,
) => unknown[];

export class Transaction<N extends string, P extends unknown[]> {
  public metadata = new Metadata();

  public readonly sourceSliceLineage: LineageId;
  public readonly targetSliceLineage: LineageId;
  public readonly payload: P;
  public readonly actionId: string;
  public readonly uid = incrementalId();

  toJSONObj(store: Store, payloadSerializer: PayloadSerializer<N, P>) {
    return {
      // lineage-ids are are not stable across the browser refreshes.
      // stable slice ids are used instead. They are not foolproof but
      // should be good enough for most cases.
      sourceSliceId: StoreState.getStableSliceId(
        store.state,
        this.sourceSliceLineage,
      ),
      targetSliceId: StoreState.getStableSliceId(
        store.state,
        this.targetSliceLineage,
      ),
      sourceSliceName: this.config.sourceSliceName,
      payload: payloadSerializer(this.payload, this),
      actionId: this.actionId,
      uid: this.uid,
      metadata: this.metadata.toJSONObj(),
    };
  }

  static fromJSONObj(
    store: Store,
    obj: JSONTransaction,
    payloadParser: PayloadParser,
    debugInfo?: string,
  ) {
    // very primitive check to rule out any invalid objects
    if (
      obj.uid === undefined ||
      obj.sourceSliceId === undefined ||
      obj.targetSliceId === undefined ||
      obj.sourceSliceName === undefined ||
      obj.actionId === undefined
    ) {
      throw new Error(`Invalid transaction object`);
    }

    let tx = new Transaction({
      sourceSliceLineage: StoreState.getLineageId(
        store.state,
        obj.sourceSliceId,
      ),
      targetSliceLineage: StoreState.getLineageId(
        store.state,
        obj.targetSliceId,
      ),
      sourceSliceName: obj.sourceSliceName,
      payload: payloadParser(obj.payload, obj, store),
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
      /**
       * The source slice where the transaction is created.
       * For example calling slice1.action.foo() will create a transaction with sourceSliceName = 'slice1'
       */
      sourceSliceLineage?: LineageId | undefined;
      sourceSliceName: N;
      /**
       * The target slice where the transaction is dispatched. It's should be same as source slice unless
       * you want to dispatch the transaction to a different slice.
       */
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
