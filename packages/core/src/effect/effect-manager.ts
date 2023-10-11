import { DebugLogger } from '../logger';
import type { Slice } from '../slice/slice';
import type { Store } from '../store';
import { StoreState } from '../store-state';
import { DEFAULT_MAX_WAIT } from './effect';
import { EffectRunner } from './effect-run';
import { EffectCreator, EffectScheduler, SchedulerOptions } from './types';
import { calculateSlicesChanged } from './utils';

type EffectsManagerOpts = {
  debugger: DebugLogger | undefined;
  scheduler: EffectScheduler;
};

export class EffectsManager {
  private effectManagers: EffectManager[] = [];
  private stopped = true;
  private destroyed = false;

  constructor(private readonly options: EffectsManagerOpts) {}

  stop() {
    if (this.stopped) return;

    this.stopped = true;
    this.effectManagers.forEach((effect) => effect._stop());
  }

  start(store: Store<any>) {
    if (!this.stopped) return;

    this.stopped = false;
    this.effectManagers.forEach((effect) => effect._start(store));
  }

  add(store: Store<any>, effectCreator: EffectCreator) {
    const initManager = new EffectManager(store, effectCreator, {
      ...this.options,
      onDestroy: (manager) => {
        this.effectManagers = this.effectManagers.filter(
          (effect) => effect !== manager,
        );
      },
    });
    this.effectManagers.push(initManager);

    if (!this.stopped) {
      initManager._start(store);
    }

    return initManager;
  }

  destroy() {
    if (this.destroyed) return;

    this.stop();
    this.effectManagers.forEach((effect) => effect.destroy());
    this.effectManagers = [];
    this.destroyed = true;
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
        oldState,
        slicesChanged,
      }),
    );
  }
}

export class EffectManager {
  private destroyed = false;
  private effectRunner;
  private pendingRunCancelCb: undefined | (() => void);
  private schedulerOptions: SchedulerOptions;
  private stopped = true;

  constructor(
    store: Store<any>,
    effectCreator: EffectCreator,
    private options: {
      onDestroy: (effectManager: EffectManager) => void;
      scheduler: EffectScheduler;
    },
  ) {
    this.effectRunner = new EffectRunner(store, effectCreator);
    this.schedulerOptions = {
      maxWait:
        typeof effectCreator.options.maxWait === 'number'
          ? effectCreator.options.maxWait
          : DEFAULT_MAX_WAIT,
      metadata: effectCreator.options.metadata || {},
    };
  }

  destroy() {
    this._stop();
    this.destroyed = true;
    this.effectRunner.destroy();
    this.options.onDestroy(this);
  }

  // @internal
  _onStateChange({
    store,
    oldState,
    slicesChanged,
  }: {
    store: Store<any>;
    oldState: StoreState<any> | undefined;
    slicesChanged: ReadonlySet<Slice>;
  }) {
    if (this.destroyed || this.stopped || this.pendingRunCancelCb) return;

    const neverRan = this.effectRunner.neverRan;
    const effectTracksSlices = this.effectRunner.tracksSlice(slicesChanged);
    // an optimization to run effect only if it tracks any of the slices
    // or it has never ran before
    if (neverRan || effectTracksSlices) {
      this.pendingRunCancelCb = this.options.scheduler(() => {
        try {
          if (!this.stopped) {
            this.effectRunner.run(store);
          }
        } finally {
          this.pendingRunCancelCb = undefined;
        }
      }, this.schedulerOptions);
    }
  }

  // @internal
  _stop() {
    this.stopped = true;
    this.pendingRunCancelCb?.();
    this.pendingRunCancelCb = undefined;
  }

  // @internal
  _start(store: Store<any>) {
    if (!this.stopped) return;
    this.stopped = false;
    this._onStateChange({
      store,
      oldState: undefined,
      // signal all slices changed, so that
      // every effect considers itself as changed
      slicesChanged: store._computed.allSlices,
    });
  }
}
