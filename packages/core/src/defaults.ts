import { EffectScheduler } from './effect/types';
import { hasIdleCallback } from './helpers/has-idle-callback';

export const DEFAULT_MAX_WAIT = 15;

export const DEFAULT_SCHEDULER: EffectScheduler = (cb, opts) => {
  if (hasIdleCallback) {
    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    const ref = window.requestIdleCallback(cb, {
      timeout: opts.maxWait,
    });
    return () => {
      window.cancelIdleCallback(ref);
    };
  } else {
    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    const ref = setTimeout(cb, opts.maxWait);
    return () => {
      clearTimeout(ref);
    };
  }
};
