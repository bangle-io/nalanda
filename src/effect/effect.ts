import { AnySlice } from '../types';
import { BaseStore, Dispatch, InferSliceNameFromStore } from '../base-store';
import { Store } from '../store';
import { RunInstance } from './run-instance';

export type ValidEffectStore<
  TStoreSlices extends string,
  TSliceName extends string,
> = TSliceName extends TStoreSlices ? EffectStore<TStoreSlices> : never;

export type EffectOpts = {
  autoRegister?: boolean;
};

export type EffectCreator = (store: Store<any>) => Effect;

export type EffectCallback<TStore extends BaseStore<any>> = (
  store: EffectStore<InferSliceNameFromStore<TStore>>,
) => void | Promise<void>;

export type CleanupCallback = () => void | Promise<void>;

export function cleanup(store: EffectStore<any>, cb: CleanupCallback): void {
  store._runInstance.addCleanup(cb);
}

export class EffectStore<TSliceName extends string>
  implements BaseStore<TSliceName>
{
  /**
   * @internal
   */
  _runInstance = new RunInstance();

  dispatch: Dispatch = (txn, opts) => this.rootStore.dispatch(txn, opts);

  get state(): any {
    return this.rootStore.state;
  }

  constructor(private readonly rootStore: Store) {}

  /**
   * @internal
   */
  _addTrackedField(slice: AnySlice, field: string, val: unknown): void {
    this._runInstance.addTrackedField(slice, field, val);
  }

  /**
   * @internal
   */
  _newRunInstance(): void {
    this._runInstance = this._runInstance.newRun();
  }
}

export class Effect {
  private effectStore: EffectStore<any>;

  private destroyed = false;

  private pendingRun = false;

  private runCount = 0;

  constructor(
    private readonly callback: EffectCallback<EffectStore<any>>,
    private readonly store: Store<any>,
    public readonly opts: EffectOpts,
  ) {
    this.effectStore = new EffectStore(store);
  }

  private shouldQueueRun(slicesChanged?: Set<AnySlice>): boolean {
    if (this.destroyed) {
      return false;
    }

    if (slicesChanged === undefined) {
      return true;
    }

    for (const slice of this.effectStore._runInstance._dependencies.keys()) {
      if (slicesChanged.has(slice)) {
        return true;
      }
    }

    if (this.runCount === 0) {
      return true;
    }

    return false;
  }

  /**
   * If slicesChanged is undefined, it will always run the effect.
   * The effect will also run at least once, regardless of slicesChanged.
   * @param slicesChanged
   * @returns
   */
  run(slicesChanged?: Set<AnySlice>): boolean {
    if (this.pendingRun) {
      return false;
    }

    if (!this.shouldQueueRun(slicesChanged)) {
      return false;
    }

    this.pendingRun = true;
    queueMicrotask(() => {
      this._run();
      this.pendingRun = false;
    });

    return true;
  }

  private _run(): void {
    // if runCount is 0, always= run, to ensure the effect runs at least once
    if (this.runCount > 0) {
      const depChanged =
        this.effectStore._runInstance.didDependenciesStateChange(
          this.effectStore,
        );

      if (!depChanged) {
        return;
      }
    }

    this.effectStore._newRunInstance();
    void this.callback(this.effectStore);
    this.runCount++;
  }

  destroy(): void {
    this.effectStore._newRunInstance();
    this.destroyed = true;
  }
}

export function effect<TStore extends BaseStore<any>>(
  callback: EffectCallback<TStore>,
  opts: EffectOpts = {},
): EffectCreator {
  return (store: Store<any>) => {
    const newEffect = new Effect(callback, store, opts);

    return newEffect;
  };
}
