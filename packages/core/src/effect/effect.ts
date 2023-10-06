import { BaseStore } from '../base-store';
import { EffectRun } from './effect-run';
import { hasIdleCallback } from '../helpers/has-idle-callback';
import type { BaseField } from '../slice/field';
import type { DebugLogger } from '../logger';
import type { Operation } from './operation';
import type { Slice } from '../slice/slice';
import type { Store } from '../store';
import type { Transaction } from '../transaction';
import { StoreState } from '../store-state';

const DEFAULT_MAX_WAIT = 15;

export type EffectOpts = {
  /**
   * @internal - havent implemented it
   * Effects are deferred by default. If set to false, the effect will run immediately after
   * a store state change. If set to true, the effect will run anytime before maxWait.
   */
  deferred: boolean;
  maxWait: number;
  scheduler: EffectScheduler;
  name?: string;
};

export class EffectStore<TSliceName extends string = any> extends BaseStore {
  // @internal
  constructor(
    // @internal
    public _rootStore: Store<any>,
    public readonly name: string,
    /**
     * @internal
     */
    public _getRunInstance: () => EffectRun,
  ) {
    super();
  }

  get state(): StoreState<TSliceName> {
    return this._rootStore.state;
  }

  dispatch(txn: Transaction | Operation) {
    this._rootStore.dispatch(txn);
  }
}

export type EffectScheduler = (
  cb: () => void,
  // eslint-disable-next-line @typescript-eslint/ban-types
  opts: Omit<EffectOpts, 'scheduler'> & {},
) => void;

export type EffectCallback<TSliceName extends string = any> = (
  store: EffectStore<TSliceName>,
) => void | Promise<void>;
export type EffectCreator = (store: Store<any>) => Effect;

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
  // @internal
  private readonly debugLogger: DebugLogger | undefined;
  // @internal
  private destroyed = false;
  // @internal
  private pendingRun = false;
  // @internal
  private readonly effectStore: EffectStore;
  // @internal
  private readonly scheduler: EffectScheduler;
  // @internal
  private runCount = 0;
  // @internal
  private runInstance: EffectRun;

  // @internal
  constructor(
    // @internal
    private readonly effectCallback: EffectCallback,
    // @internal
    private readonly rootStore: Store<any>,
    public readonly opts: EffectOpts,
  ) {
    this.name = opts.name || effectCallback.name || 'anonymous';
    this.debugLogger = rootStore.options.debug;
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
  // @internal
  _run(slicesChanged?: Set<Slice>): boolean {
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
          this.runInternal();
        } finally {
          this.pendingRun = false;
        }
      });
    }, this.opts);

    return true;
  }

  // @internal
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

  // @internal
  private runInternal(): void {
    if (this.destroyed) {
      return;
    }

    let fieldChanged: BaseField | undefined;

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

    this.debugLogger?.({
      type: this.opts.deferred ? 'UPDATE_EFFECT' : 'SYNC_UPDATE_EFFECT',
      name: this.name,
      changed: fieldChanged?.id || '<first-run-OR-forced>',
    });
  }
}

export function effect<TSliceName extends string>(
  callback: EffectCallback,
  {
    deferred = true,
    maxWait = DEFAULT_MAX_WAIT,
    scheduler = DEFAULT_SCHEDULER,
  }: Partial<EffectOpts> = {},
): EffectCreator {
  return (store: Store<TSliceName>) => {
    const newEffect = new Effect(callback, store, {
      deferred,
      maxWait,
      scheduler,
    });

    return newEffect;
  };
}
