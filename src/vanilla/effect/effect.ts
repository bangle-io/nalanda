import { BaseStore } from '../base-store';
import type { BaseField } from '../slice/field';
import { hasIdleCallback } from '../helpers/has-idle-callback';
import type { DebugLogger } from '../logger';
import { Slice } from '../slice/slice';
import type { Store } from '../store';
import { Transaction } from '../transaction';
import { EffectRun } from './effect-run';
import { Operation } from './operation';

const DEFAULT_MAX_WAIT = 15;

export type EffectOpts = {
  /**
   * @internal - havent implemented it
   * Effects are deferred by default. If set to false, the effect will run immediately after
   * a store state change. If set to true, the effect will run anytime before maxWait.
   */
  deferred: boolean;
  /**
   *
   */
  maxWait: number;
  scheduler: EffectScheduler;
  name?: string;
};

export class EffectStore extends BaseStore {
  constructor(
    /**
     * @internal
     */
    private _rootStore: Store,
    public readonly name: string,
    /**
     * @internal
     */
    public _getRunInstance: () => EffectRun,
  ) {
    super();
  }

  get state() {
    return this._rootStore.state;
  }

  dispatch(txn: Transaction | Operation) {
    this._rootStore.dispatch(txn);
  }
}

export type EffectScheduler = (
  cb: () => void,
  opts: Omit<EffectOpts, 'scheduler'> & {},
) => void;

export type EffectCallback = (store: EffectStore) => void | Promise<void>;
export type EffectCreator = (store: Store) => Effect;

const DEFAULT_SCHEDULER: EffectScheduler = (cb, opts) => {
  if (opts.deferred) {
    if (hasIdleCallback) {
      window.requestIdleCallback(cb, { timeout: opts.maxWait });
    } else {
      setTimeout(cb, opts.maxWait);
    }
  } else {
    queueMicrotask(cb);
  }
};

export class Effect {
  public readonly name: string;
  public readonly debug: DebugLogger | undefined;
  private destroyed = false;
  private pendingRun = false;
  private readonly effectStore: EffectStore;
  private readonly scheduler: EffectScheduler;
  private runCount = 0;
  private runInstance: EffectRun;

  constructor(
    private readonly effectCallback: EffectCallback,
    private readonly rootStore: Store,
    public readonly opts: EffectOpts,
  ) {
    this.name = opts.name || effectCallback.name || 'anonymous';
    this.debug = rootStore.options.debug;
    this.scheduler =
      rootStore.options?.overrides?.effectSchedulerOverride || opts.scheduler;

    this.runInstance = new EffectRun(rootStore, this.name);
    this.effectStore = new EffectStore(rootStore, this.name, () => {
      return this.runInstance;
    });
  }

  destroy(): void {
    if (this.destroyed) {
      return;
    }

    this.destroyed = true;
    this.runInstance.destroy();
  }

  /**
   * If slicesChanged is undefined, it will attempt to run the effect provided other conditions are met.
   * The effect is guaranteed to run at least once.
   * @param slicesChanged
   * @returns
   */
  run(slicesChanged?: Set<Slice>): boolean {
    if (this.pendingRun || this.destroyed) {
      return false;
    }

    if (!this.shouldQueueRun(slicesChanged)) {
      return false;
    }

    this.pendingRun = true;
    this.scheduler(() => {
      queueMicrotask(() => {
        try {
          this._run();
        } finally {
          this.pendingRun = false;
        }
      });
    }, this.opts);

    return true;
  }

  private shouldQueueRun(slicesChanged?: Set<Slice>): boolean {
    if (this.destroyed) {
      return false;
    }

    if (slicesChanged === undefined) {
      return true;
    }

    for (const { field } of this.runInstance.getTrackedFields()) {
      const parentSlice = field._getSlice();
      if (slicesChanged.has(parentSlice)) {
        return true;
      }
    }

    if (this.runCount === 0) {
      return true;
    }

    return false;
  }

  private _run(): void {
    if (this.destroyed) {
      return;
    }

    let fieldChanged: BaseField<unknown> | undefined;

    // if runCount == 0, always run, to ensure the effect runs at least once
    if (this.runCount != 0) {
      const depChanged = this.runInstance.whatDependenciesStateChange();

      fieldChanged = depChanged;

      // if nothing changed in the dependencies, don't run the effect
      if (!fieldChanged) {
        return;
      }
    }

    const oldInstance = this.runInstance;
    oldInstance.destroy();

    this.runInstance = new EffectRun(this.rootStore, this.name);

    this.runCount++;
    void this.effectCallback(this.effectStore);

    this.debug?.({
      type: this.opts.deferred ? 'UPDATE_EFFECT' : 'SYNC_UPDATE_EFFECT',
      name: this.name,
      changed: fieldChanged?.id || '<first-run-OR-forced>',
    });
  }
}

export function effect(
  callback: EffectCallback,
  {
    deferred = true,
    maxWait = DEFAULT_MAX_WAIT,
    scheduler = DEFAULT_SCHEDULER,
  }: Partial<EffectOpts> = {},
): EffectCreator {
  return (store: Store) => {
    const newEffect = new Effect(callback, store, {
      deferred,
      maxWait,
      scheduler,
    });

    return newEffect;
  };
}
