import { DebugLogger } from '../logger';
import type { Slice } from '../slice/slice';
import type { Store } from '../store';
import { StoreState } from '../store-state';
import { EffectStore } from './effect-store';
import { EffectTracker } from './effect-tracker';
import { EffectConfig, EffectScheduler } from './types';
import { calculateSlicesChanged } from './utils';

type EffectsManagerOpts = {
  debugger: DebugLogger | undefined;
  scheduler: EffectScheduler;
};

export class EffectsManager {
  private effectsConfig: Set<EffectConfig> = new Set();
  private effectManagers: EffectManager[] = [];

  private stopped = true;
  private destroyed = false;

  constructor(private readonly options: EffectsManagerOpts) {}

  /**
   * if stopped, calling start will trigger all effects to run again
   * regardless of whether they have changed or not.
   */
  start(store: Store<any>) {
    if (!this.stopped) return;

    this.stopped = false;
    this.effectsConfig.forEach((effectConfig) => this.add(store, effectConfig));
  }

  destroyEffect(effectName: string) {
    for (const config of this.effectsConfig) {
      if (config.name === effectName) {
        // remove config so we don't end up adding it again in start
        this.effectsConfig.delete(config);
        break;
      }
    }

    for (const manager of this.effectManagers) {
      if (manager.effectName === effectName) {
        // the manager will remove itself from the list
        // due to the onDestroy callback
        manager.destroy();
        break;
      }
    }
  }

  add(
    store: Store<any>,
    effectConfig: EffectConfig,
    // optional for testing
    effectTracker: EffectTracker = new EffectTracker([]),
  ) {
    this.effectsConfig.add(effectConfig);

    if (this.stopped) return;

    const initManager = new EffectManager(store, {
      effectTracker,
      effectConfig,
      scheduler: this.options.scheduler,
      onDestroy: (target) => {
        this.effectManagers = this.effectManagers.filter((manager) => {
          return manager !== target;
        });
      },
    });

    this.effectManagers.push(initManager);

    // trigger the effect to run on mount
    initManager._onStateChange({
      store,
      // signal all slices changed, so that
      // every effect considers itself as changed
      slicesChanged: store._computed.allSlices,
    });
  }

  destroy() {
    if (this.destroyed) return;
    this.stop();
    this.effectsConfig.clear();
    this.destroyed = true;
  }

  stop() {
    if (this.stopped) return;
    this.stopped = true;
    this.effectManagers.forEach((effect) => effect.destroy());
    this.effectManagers = [];
  }

  onStateChange({
    store,
    oldState,
  }: {
    store: Store<any>;
    oldState: StoreState<any>;
  }) {
    const slicesChanged = calculateSlicesChanged({
      newState: store.state,
      oldState,
      storeComputed: store._computed,
    });

    this.effectManagers.forEach((effect) =>
      effect._onStateChange({
        store,
        slicesChanged,
      }),
    );
  }
}

export class EffectManager {
  private destroyed = false;
  private effectStore: EffectStore;
  private effectTracker: EffectTracker;
  private pendingRunCancelCb: undefined | (() => void);
  private pendingRun = false;
  private runCount = 0;
  public readonly effectName: string;

  constructor(
    store: Store<any>,
    private options: {
      readonly effectConfig: EffectConfig;
      readonly effectTracker: EffectTracker;
      readonly onDestroy: (effectManager: EffectManager) => void;
      readonly scheduler: EffectScheduler;
    },
  ) {
    this.effectName = options.effectConfig.name;
    this.effectTracker = options.effectTracker;
    this.effectStore = new EffectStore(store, this.effectTracker);
  }

  destroy() {
    if (this.destroyed) return;

    this.destroyed = true;
    this.pendingRunCancelCb?.();
    this.pendingRunCancelCb = undefined;
    this.pendingRun = false;
    this.effectStore._destroy();
    this.effectTracker.destroy();

    this.options.onDestroy(this);
  }

  // @internal
  _onStateChange({
    store,
    slicesChanged,
  }: {
    store: Store<any>;
    slicesChanged: ReadonlySet<Slice>;
  }) {
    if (this.destroyed || this.pendingRun) return;

    const effectTracksSlices = this.effectTracker.doesTrackSlice(slicesChanged);
    // an optimization to run effect only if it tracks any of the slices
    // or it has never ran before
    if (this.runCount === 0 || effectTracksSlices) {
      this.pendingRun = true;
      this.pendingRunCancelCb = this.options.scheduler(() => {
        return this.run(store);
      }, this.options.effectConfig.schedulerOptions);
    }
  }

  private run(store: Store<any>): void | Promise<void> {
    try {
      if (this.destroyed) {
        return undefined;
      }
      const fieldChanged = this.effectTracker.whatFieldChanged(store.state);
      const neverRan = this.runCount === 0;

      if (!neverRan && !fieldChanged) {
        return undefined;
      }
      // now that we are running the effect clear the existing trackers
      // so that we can start tracking new fields in the run
      this.effectTracker.clearTracker();
      this.effectStore._destroy();
      this.effectStore = new EffectStore(store, this.effectTracker);
      const result = this.options.effectConfig.callback(this.effectStore);

      if (result instanceof Promise) {
        return result.then(() => {});
      }
    } finally {
      this.runCount++;
      this.pendingRun = false;
    }
  }
}
