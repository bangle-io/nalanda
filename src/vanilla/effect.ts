import { calcReverseDependencies, flattenReverseDependencies } from './helpers';
import { SliceContext, SliceKey } from './internal-types';
import { AnySlice, Effect } from './public-types';
import type { BareSlice } from './slice';
import type { InternalStoreState } from './state';
import type { Store } from './store';
import { DebugFunc } from './transaction';

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

  private *_effectHandlerEntries(): Iterable<EffectHandler> {
    for (const handlers of Object.values(this._effects.record)) {
      for (const handler of handlers) {
        yield handler;
      }
    }
  }

  destroy(state: InternalStoreState) {
    for (const effectHandler of this._effectHandlerEntries()) {
      effectHandler.destroy?.(state);
    }
  }

  constructor(
    slices: BareSlice[],
    initState: InternalStoreState,
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
      if (slice.spec.effects) {
        this._effects.record[slice.key] = slice.spec.effects.map(
          (effect) => new EffectHandler(effect, initState, slice, _debug),
        );
      }
    });
  }

  // TODO: this will be removed once we have better way of adding dynamic slices
  _tempRegisterOnSyncChange(sliceKey: SliceKey, cb: () => void) {
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

  initEffects(store: Store) {
    for (const effectHandler of this._effectHandlerEntries()) {
      effectHandler.runInit(store);
    }
  }

  queueSideEffectExecution(
    store: Store,
    {
      sliceKey,
      actionId,
    }: {
      sliceKey: SliceKey;
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

  private _runLoop(store: Store) {
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

  private _runSyncUpdateEffects(store: Store) {
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

  private _runUpdateEffect(store: Store, onDone: () => void) {
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
  private _syncPrevState: InternalStoreState;
  private _deferredPrevState: InternalStoreState;

  public debugSyncLastRanBy: { sliceKey: string; actionId: string }[] = [];
  public debugDeferredLastRanBy: { sliceKey: string; actionId: string }[] = [];
  private _ref = {};
  private _sliceContext: SliceContext;

  constructor(
    public effect: Effect<any>,
    public readonly initStoreState: InternalStoreState,
    protected _slice: BareSlice,
    private _debug?: DebugFunc,
  ) {
    this._deferredPrevState = this.initStoreState;
    this._syncPrevState = this.initStoreState;
    this._sliceContext = {
      sliceKey: this._slice.key,
    };
  }

  public addDebugInfo(payload: { sliceKey: string; actionId: string }) {
    if (!this._debug) {
      return;
    }
    this.debugSyncLastRanBy.push(payload);
    this.debugDeferredLastRanBy.push(payload);
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
    return this._slice.key;
  }

  runInit(store: Store) {
    this.effect.init?.(
      this._slice as AnySlice,
      store.getReducedStore(this.effect.name, {
        sliceKey: this._slice.key,
      }),
      this._ref,
    );
  }

  destroy(state: InternalStoreState) {
    this.effect.destroy?.(this._slice, state, this._ref);
    this._ref = {};
  }

  runSyncUpdate(store: Store) {
    // Note: if it is the first time an effect is running this
    // the previouslySeenState would be the initial state
    const previouslySeenState = this._syncPrevState;
    // `previouslySeenState` needs to always be the one that the effect.update has seen before or the initial state.
    // Here we are saving the store.state before calling update, because an update can dispatch an action and
    // causing another run of of effects, and giving a stale previouslySeen to those effect update calls.
    this._syncPrevState = store.state;
    if (this.effect.updateSync) {
      this._sendDebugInfo('sync');

      // TODO error handling
      this.effect.updateSync(
        this._slice as AnySlice,
        store.getReducedStore(this.effect.name, this._sliceContext),
        previouslySeenState._withContext(this._sliceContext),
        this._ref,
      );
    }
  }

  runDeferredUpdate(store: Store) {
    const previouslySeenState = this._deferredPrevState;
    this._deferredPrevState = store.state;

    if (this.effect.update) {
      this._sendDebugInfo('deferred');

      // TODO error handling
      this.effect.update(
        this._slice as AnySlice,
        store.getReducedStore(this.effect.name, this._sliceContext),
        previouslySeenState._withContext(this._sliceContext),
        this._ref,
      );
    }
  }
}
