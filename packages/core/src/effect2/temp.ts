import { BaseStore } from '../base-store';
import { genEffectId } from '../helpers/id-generation';
import { BaseField, StateField } from '../slice/field';
import { Slice } from '../slice/slice';
import { Store } from '../store';
import { StoreState } from '../store-state';
import { Transaction } from '../transaction';

export type EffectOpts = {
  maxWait: number;
  scheduler: EffectScheduler;
  name?: string;
  metadata?: Record<string, any>;
};

type SchedulerOptions = {
  metadata: Record<string, any>;
};

export type EffectScheduler = (
  run: () => void,
  schedulerOptions: SchedulerOptions,
) => () => void;

export type EffectCallback<TSliceName extends string = any> = (
  store: EffectStore<TSliceName>,
) => void | Promise<void>;

export type EffectCreator = {
  callback: EffectCallback<any>;
  options: EffectOpts;
};

export class EffectsManager {
  private effectManagers: EffectManager[] = [];
  private stopped = true;

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
    const initManager = new EffectManager(store, effectCreator, (manager) => {
      this.effectManagers = this.effectManagers.filter(
        (effect) => effect !== manager,
      );
    });
    this.effectManagers.push(initManager);

    if (!this.stopped) {
      initManager._start(store);
    }

    return initManager;
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
  private scheduler: EffectScheduler;
  private schedulerOptions: SchedulerOptions;
  private stopped = true;

  constructor(
    store: Store<any>,
    effectCreator: EffectCreator,
    private onDestroy: (effectManager: EffectManager) => void,
  ) {
    this.effectRunner = new EffectRunner(store, effectCreator);
    this.scheduler = effectCreator.options.scheduler;
    this.schedulerOptions = {
      metadata: effectCreator.options.metadata || {},
    };
  }

  destroy() {
    this._stop();
    this.destroyed = true;
    this.effectRunner.destroy();
    this.onDestroy(this);
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
      this.pendingRunCancelCb = this.scheduler(() => {
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

export class EffectRunner {
  private destroyed = false;
  private runCount = 0;
  private effectStore: EffectStore;
  public readonly effectName;

  constructor(
    store: Store<any>,
    public readonly effectCreator: EffectCreator,
  ) {
    this.effectName = genEffectId.generate(
      effectCreator.options.name ||
        effectCreator.callback.name ||
        'unnamed-effect',
    );
    this.effectStore = new EffectStore(store, this.effectName);
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.effectStore._destroy();
  }

  get neverRan() {
    return this.runCount === 0;
  }

  tracksSlice(slices: ReadonlySet<Slice>): boolean {
    return doesTrackSlice(slices, this.effectStore._tracker.fieldValues);
  }

  run(store: Store<any>): boolean {
    if (this.destroyed) return false;

    const fieldChanged = whatFieldChanged(
      this.effectStore.state,
      this.effectStore._tracker.fieldValues,
    );

    if (!this.neverRan && !fieldChanged) {
      return false;
    }

    return this.runEffect(store);
  }

  private runEffect(store: Store<any>): true {
    this.runCount++;

    this.effectStore._destroy();
    this.effectStore = new EffectStore(store, this.effectName);
    void this.effectCreator.callback(this.effectStore);

    return true;
  }
}

export class EffectStore<TSliceName extends string = any> extends BaseStore {
  private destroyed = false;
  private readonly internalTracker: Tracker = {
    fieldValues: [],
    cleanups: [],
  };

  get state(): StoreState<TSliceName> {
    return this._rootStore.state;
  }

  dispatch(txn: Transaction<any, any>) {
    this._rootStore.dispatch(txn);
  }

  // @internal
  get _tracker(): {
    readonly fieldValues: ReadonlyArray<FieldTracker>;
    readonly cleanups: ReadonlyArray<() => void>;
  } {
    return this.internalTracker;
  }

  // @internal
  constructor(
    // TODO does this have to be public
    // @internal
    public _rootStore: Store<any>,
    public readonly name: string,
  ) {
    super();
  }

  // @internal
  _addTrackField(trackedField: FieldTracker) {
    this.internalTracker.fieldValues.push(trackedField);
  }

  // @internal
  _addCleanup(cleanup: Tracker['cleanups'][0]) {
    this.internalTracker.cleanups.push(cleanup);
  }

  // TODO freeze, where we prevent dispatching txns post effect cleanup
  // if user wants that behaviour
  // @internal
  _destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.internalTracker.cleanups.forEach((cleanup) => cleanup());
    this.internalTracker.cleanups = [];
    this.internalTracker.fieldValues = [];
  }
}

interface Tracker {
  fieldValues: FieldTracker[];
  cleanups: (() => void)[];
}

export type FieldTracker = {
  field: BaseField<any>;
  value: unknown;
};

// find out what field changed
export function whatFieldChanged(
  state: StoreState<any>,
  fieldTrackers: ReadonlyArray<FieldTracker>,
):
  | {
      field: BaseField<any>;
      newVal: unknown;
      oldVal: unknown;
    }
  | undefined {
  for (const { field, value } of fieldTrackers) {
    const newVal = field.get(state);

    if (!field.isEqual(newVal, value)) {
      return { field, newVal, oldVal: value };
    }
  }

  return undefined;
}

/**
 * Tells whether the field trackers track any of the slices provided
 * @param slices
 * @param fieldTrackers
 * @returns
 */
export function doesTrackSlice(
  slices: ReadonlySet<Slice>,
  fieldTrackers: ReadonlyArray<FieldTracker>,
) {
  for (const { field } of fieldTrackers) {
    const parentSlice = field._getSlice();
    if (slices.has(parentSlice)) {
      return true;
    }
  }
  return false;
}

export function calculateSlicesChanged({
  newState,
  oldState,
  storeComputed,
}: {
  newState: StoreState<any>;
  oldState: StoreState<any>;
  storeComputed: Store<any>['_computed'];
}): ReadonlySet<Slice> {
  const slicesChanged = new Set<Slice>();

  storeComputed.allSlices.forEach((slice) => {
    if (slicesChanged.has(slice)) {
      return;
    }
    if (newState._didSliceStateChange(slice, oldState)) {
      slicesChanged.add(slice);

      // also add all slices that depend on this slice, so that derived state can be recalculated
      storeComputed.reverseAllDependencies[slice.sliceId]?.forEach(
        (dependentSlice) => {
          // TODO we can add a check here on _didSliceStateChange to avoid adding slices that didn't change
          // but I am not sure if it's worth the optimization - since there are
          // additional checks on the effect side as well.
          slicesChanged.add(dependentSlice);
        },
      );
    }
  });

  return slicesChanged;
}
