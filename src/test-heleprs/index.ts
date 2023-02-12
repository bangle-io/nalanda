import type {
  Action,
  AnySlice,
  BareStore,
  Effect,
} from '../vanilla/public-types';
import { Slice } from '../vanilla/slice';

/**
 * To be only used for testing scenarios. In production, slices should always have the same code
 */
export function testOverrideSlice<SL extends AnySlice>(
  slice: SL,
  {
    dependencies = slice.config.dependencies,
    initState = slice.config.initState,
    effects = slice.config.effects,
    actions = slice.config.actions,
    selectors = slice.config.selectors,
  }: {
    // since this is for testing, we can allow any slice
    dependencies?: AnySlice[];
    initState?: SL['initState'];
    effects?: Effect<any>[];
    actions?: Record<string, Action<any[], any, any>>;
    selectors?: Record<string, any>;
  },
): SL {
  return new Slice({
    key: slice.key,
    initState,
    actions,
    selectors,
    dependencies,
    effects: effects || [],
  }) as any;
}

export function waitUntil<B extends BareStore<any>>(
  store: B,
  condition: (state: B['state']) => boolean,
  waitUntil = 100,
  pollFrequency = 5,
): Promise<B['state']> {
  let interval: ReturnType<typeof setInterval> | undefined;
  let timeout: ReturnType<typeof setTimeout> | undefined;

  return new Promise<B['state']>((resolve, reject) => {
    timeout = setTimeout(() => {
      clearInterval(interval);
      reject(new Error('Timeout condition not met'));
    }, waitUntil);

    interval = setInterval(() => {
      if (condition(store.state)) {
        clearTimeout(timeout);
        clearInterval(interval);
        resolve(store.state);
      }
    }, pollFrequency);
  });
}
