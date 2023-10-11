import type { BaseField } from '../slice/field';
import type { EffectStore } from './effect-store';

export type EffectOpts = {
  name?: string;
  metadata?: Record<string, any>;
  maxWait?: number;
};

export type SchedulerOptions = {
  metadata: Record<string, any>;
  maxWait: number;
};

export type EffectScheduler = (
  run: () => void,
  schedulerOptions: SchedulerOptions,
) => () => void;

export type EffectCallback<TSliceName extends string = any> = (
  store: EffectStore<TSliceName>,
) => void | Promise<void>;

export type EffectCreator = {
  callback: EffectCallback<any>;
  options: EffectOpts;
};

export type EffectCleanupCallback = () => void | Promise<void>;

export interface Tracker {
  fieldValues: FieldTracker[];
  cleanups: EffectCleanupCallback[];
}

export type FieldTracker = {
  field: BaseField<any>;
  value: unknown;
};
