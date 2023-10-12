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
  name: string;
};

export type EffectScheduler = (
  run: () => void | Promise<void>,
  schedulerOptions: SchedulerOptions,
) => () => void;

export type EffectCallback<TSliceName extends string = any> = (
  store: EffectStore<TSliceName>,
) => void | Promise<void>;

export type EffectCleanupCallback = () => void | Promise<void>;

export interface EffectConfig {
  readonly name: string;
  readonly options: EffectOpts;
  readonly callback: EffectCallback<any>;
  readonly schedulerOptions: SchedulerOptions;
}

export type FieldTracker = {
  readonly field: BaseField<any>;
  readonly value: unknown;
};
