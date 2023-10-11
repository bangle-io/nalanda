import { hasIdleCallback } from '../helpers/has-idle-callback';
import type {
  EffectCallback,
  EffectCreator,
  EffectOpts,
  EffectScheduler,
} from './types';

export const DEFAULT_MAX_WAIT = 15;

export const DEFAULT_SCHEDULER: EffectScheduler = (cb, opts) => {
  if (hasIdleCallback) {
    const ref = window.requestIdleCallback(cb, {
      timeout: opts.maxWait,
    });
    return () => {
      window.cancelIdleCallback(ref);
    };
  } else {
    const ref = setTimeout(cb, opts.maxWait);
    return () => {
      clearTimeout(ref);
    };
  }
};

export function effect<TSliceName extends string>(
  callback: EffectCallback<TSliceName>,
  options: Partial<EffectOpts> = {},
): EffectCreator {
  return {
    callback,
    options,
  };
}
