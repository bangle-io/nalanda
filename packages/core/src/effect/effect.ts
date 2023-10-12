import { DEFAULT_MAX_WAIT } from '../defaults';
import { hasIdleCallback } from '../helpers/has-idle-callback';
import { genEffectId } from '../helpers/id-generation';
import type {
  EffectConfig,
  EffectCallback,
  EffectOpts,
  EffectScheduler,
} from './types';

export function createEffectConfig(
  callback: EffectCallback<any>,
  options: Partial<EffectOpts> = {},
): EffectConfig {
  const name = genEffectId.generate(
    options.name || callback.name || 'unnamed-effect',
  );

  // TODO unify effect options
  const schedulerOptions = {
    name,
    maxWait:
      typeof options.maxWait === 'number' ? options.maxWait : DEFAULT_MAX_WAIT,
    metadata: options.metadata || {},
  };

  return {
    name,
    options,
    callback,
    schedulerOptions,
  };
}
