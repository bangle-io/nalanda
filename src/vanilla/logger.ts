import { SliceId } from './types';

type LogTypes = TransactionLog | OperationLog | EffectLog;

export type DebugLogger = (log: LogTypes) => void;

export interface TransactionLog {
  type: 'TRANSACTION';
  action?: string;
  dispatcher?: string | undefined;
  sourceSlice: SliceId;
  store?: string | undefined;
  id: string;
}

export interface OperationLog {
  type: 'OPERATION';
  dispatcher?: string | undefined;
  store?: string | undefined;
  id: string;
}

export interface EffectLog {
  type: 'SYNC_UPDATE_EFFECT' | 'UPDATE_EFFECT';
  name: string;
  changed: string;
}
