import { calcReverseDependencies, flattenReverseDependencies } from './common';
import type { DebugFunc } from './logging';
import type { Slice } from './slice';
import type { StoreState } from './state';
import type { Store } from './store';
import type { AnySliceBase, EffectsBase } from './types';

export interface Scheduler {
  schedule: (cb: () => void) => void;
}

export const idleCallbackScheduler: (timeout: number) => Scheduler = (
  timeout,
) => ({
  schedule: (cb) => {
    return requestIdleCallback(cb, { timeout });
  },
});

export const timeoutSchedular: (timeout: number) => Scheduler = (timeout) => ({
  schedule: (cb) => {
    return setTimeout(cb, timeout);
  },
});

export const syncSchedular: () => Scheduler = () => ({
  schedule: (cb) => {
    queueMicrotask(cb);
  },
});

export class SideEffectsManager {
  private _effects: {
    queue: {
      syncUpdate: Set<EffectHandler>;
      deferredUpdate: Set<EffectHandler>;
    };
    record: Record<string, EffectHandler[]>;
  } = {
    queue: {
      syncUpdate: new Set(),
      deferredUpdate: new Set(),
    },
    record: {},
  };

  private _flatReverseDep: Record<string, Set<string>>;

  destroy(state: StoreState) {
    Object.values(this._effects.record).forEach((effectHandlers) => {
      effectHandlers.forEach((effectHandler) => {
        effectHandler.destroy?.(state);
      });
    });
  }

  constructor(
    slices: AnySliceBase[],
    initState: StoreState,
    private _schedular: Scheduler = idleCallbackScheduler(15),
    _debug?: DebugFunc,
  ) {
    // TODO ensure deps are valid and don't have circular dependencies
    // nice to have if reverse dep are sorted in the order slice are defined
    this._flatReverseDep = flattenReverseDependencies(
      calcReverseDependencies(slices),
    );

    // fill in record of effects
    slices.forEach((slice) => {
      if (slice.effects) {
        this._effects.record[slice.key.key] = slice.effects.map(
          (effect) => new EffectHandler(effect, initState, slice, _debug),
        );
      }
    });
  }

  // TODO: this will be removed once we have better way of adding dynamic slices
  _tempRegisterOnSyncChange(sliceKey: string, cb: () => void) {
    let set = this._tempOnSyncChange.get(sliceKey);

    if (!set) {
      set = new Set();
      this._tempOnSyncChange.set(sliceKey, set);
    }

    set.add(cb);

    return () => {
      set?.delete(cb);
      if (set?.size === 0) {
        this._tempOnSyncChange.delete(sliceKey);
      }
    };
  }
  // TODO: this will be removed once we have better way of adding dynamic slices
  private _tempOnSyncChange = new Map<string, Set<() => void>>();

  queueSideEffectExecution(
    store: Store<any>,
    {
      sliceKey,
      actionId,
    }: {
      sliceKey: string;
      actionId: string;
    },
  ) {
    const { record, queue } = this._effects;
    // if there are no items in the queue that means
    //    we will need to trigger running of the effects
    // else if there are items, whatever we add to the queue will be run
    //    by the previous run
    // these are  just an optimization to avoid extra microtask calls
    const shouldRunSyncUpdateEffects = queue.syncUpdate.size === 0;
    const shouldRunUpdateEffects = queue.deferredUpdate.size === 0;

    // queue up effects of source slice to run
    record[sliceKey]?.forEach((effect) => {
      effect.addDebugInfo({
        sliceKey,
        actionId,
      });

      queue.syncUpdate.add(effect);
      queue.deferredUpdate.add(effect);
    });

    // queue up dependencies's effects to run
    this._flatReverseDep[sliceKey]?.forEach((revDepKey) => {
      record[revDepKey]?.forEach((effect) => {
        effect.addDebugInfo({
          sliceKey,
          actionId,
        });
        queue.syncUpdate.add(effect);
        queue.deferredUpdate.add(effect);
      });
    });

    if (shouldRunSyncUpdateEffects || shouldRunUpdateEffects) {
      // use microtask so that we yield to the code dispatching the action
      // for example
      //    store.dispatch(action1)
      //    store.state // <-- should be the correct state without interference from effects
      // if didn't queue microtask, the store.state could include more state changes than
      // what the user expected.
      queueMicrotask(() => {
        this._runLoop(store);
      });

      // TODO remove this once we have better way of adding dynamic slices
      queueMicrotask(() => {
        this._tempOnSyncChange.get(sliceKey)?.forEach((cb) => {
          cb();
        });
      });
    }
  }

  private _runLoop(store: Store<any>) {
    if (store.destroyed) {
      return;
    }

    if (this._effects.queue.syncUpdate.size > 0) {
      this._runSyncUpdateEffects(store);
    }

    if (this._effects.queue.deferredUpdate.size > 0) {
      this._runUpdateEffect(store, () => {
        this._runLoop(store);
      });
    }
  }

  private _runSyncUpdateEffects(store: Store<any>) {
    const { queue } = this._effects;

    // Note that sometimes effects can lag behind a couple of state transitions
    // if an effect before them dispatches an action or externally someone dispatches multiple
    // actions changing the state.
    while (queue.syncUpdate.size > 0 && !store.destroyed) {
      const iter = queue.syncUpdate.values().next();

      if (!iter.done) {
        const effect = iter.value;
        queue.syncUpdate.delete(effect);

        // TODO: error handling?
        effect.runSyncUpdate(store);
      }
    }
  }

  private _runUpdateEffect(store: Store<any>, onDone: () => void) {
    this._schedular.schedule(() => {
      const { queue } = this._effects;
      const iter = queue.deferredUpdate.values().next();

      if (iter.done || store.destroyed) {
        onDone();

        return;
      }

      const effect = iter.value;
      queue.deferredUpdate.delete(effect);

      try {
        effect.runDeferredUpdate(store);
      } finally {
        onDone();
      }
    });
  }
}

export class EffectHandler {
  sliceAndDeps: AnySliceBase[];

  private _syncPrevState: StoreState;
  private _deferredPrevState: StoreState;

  public debugSyncLastRanBy: { sliceKey: string; actionId: string }[] = [];
  public debugDeferredLastRanBy: { sliceKey: string; actionId: string }[] = [];

  destroy(state: StoreState) {
    this.effect.destroy?.(state);
  }

  constructor(
    public effect: EffectsBase,
    public readonly initStoreState: StoreState,
    protected _slice: AnySliceBase,
    private _debug?: DebugFunc,
  ) {
    this.sliceAndDeps = [...this._slice.key.dependencies, _slice];
    this._deferredPrevState = this.initStoreState;
    this._syncPrevState = this.initStoreState;
  }

  public addDebugInfo(payload: { sliceKey: string; actionId: string }) {
    if (!this._debug) {
      return;
    }
    {
      this.debugSyncLastRanBy.push(payload);
      this.debugDeferredLastRanBy.push(payload);
    }
  }

  private _sendDebugInfo(type: 'sync' | 'deferred') {
    if (!this._debug) {
      return;
    }

    if (type === 'sync') {
      this._debug({
        type: 'SYNC_UPDATE_EFFECT',
        name: this.effect.name || '<unknownEffect>',
        source: this.debugSyncLastRanBy,
      });
      this.debugSyncLastRanBy = [];
    }

    if (type === 'deferred') {
      this._debug({
        type: 'UPDATE_EFFECT',
        name: this.effect.name || '<unknownEffect>',
        source: this.debugDeferredLastRanBy,
      });
      this.debugDeferredLastRanBy = [];
    }
  }

  get sliceKey() {
    return this._slice.key.key;
  }

  runSyncUpdate(store: Store<any>) {
    // Note: if it is the first time an effect is running this
    // the previouslySeenState would be the initial state
    const previouslySeenState = this._syncPrevState;
    // `previouslySeenState` needs to always be the one that the effect.update has seen before or the initial state.
    // Here we are saving the store.state before calling update, because an update can dispatch an action and
    // causing another run of of effects, and giving a stale previouslySeen to those effect update calls.
    this._syncPrevState = store.state;
    this._sendDebugInfo('sync');

    // TODO error handling
    this.effect.updateSync?.(
      this._slice as Slice,
      store.getReducedStore(this.sliceAndDeps as Slice[], this.effect.name),
      previouslySeenState,
    );
  }

  runDeferredUpdate(store: Store<any>) {
    const previouslySeenState = this._deferredPrevState;
    this._deferredPrevState = store.state;

    this._sendDebugInfo('deferred');

    // TODO error handling
    this.effect.update?.(
      this._slice as Slice,
      store.getReducedStore(this.sliceAndDeps as Slice[], this.effect.name),
      previouslySeenState,
    );
  }
}
