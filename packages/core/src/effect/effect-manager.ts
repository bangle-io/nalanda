import { calcReverseDependencies } from '../helpers/dependency-helpers';
import { throwValidationError } from '../helpers/throw-error';
import type { DebugLogger } from '../logger';
import type { Slice } from '../slice/slice';
import type { Store } from '../store';
import { StoreState } from '../store-state';
import type { SliceId } from '../types';
import { effect, type Effect, type EffectCreatorObject } from './effect';
import { onAbortOnce } from './on-abort';

export class EffectManager {
  private abortController = new AbortController();
  // @internal
  _effects: Set<Effect> = new Set();
  private paused = true;
  private reverseDependencies: Record<SliceId, Set<Slice>> = {};
  private runCount = 0;
  // @internal
  _slicesChanged = new Set<Slice>();
  private slicesLookup: Record<SliceId, Slice>;

  constructor(
    private slices: Slice[],
    private readonly options: {
      debug?: DebugLogger | undefined;
    },
  ) {
    this.slicesLookup = Object.fromEntries(
      slices.map((slice) => [slice.sliceId, slice]),
    );

    this.reverseDependencies = Object.fromEntries(
      Object.entries(calcReverseDependencies(slices)).map(
        ([sliceId, sliceIds]) => {
          return [
            sliceId,
            new Set([...sliceIds].map((id) => this.slicesLookup[id]!)),
          ];
        },
      ),
    );

    onAbortOnce(this.abortController.signal, () => {
      this.paused = true;
      this._effects.forEach((effect) => {
        effect._destroy();
      });
      this._effects.clear();
      this._slicesChanged.clear();
    });
  }

  destroy() {
    this.abortController.abort();
  }

  registerEffect(
    store: Store<any>,
    effectCreatorObject: EffectCreatorObject,
  ): Effect {
    if (this.abortController.signal.aborted) {
      throwValidationError('Cannot register effect on a destroyed store.');
    }

    const effectInstance = effect(
      effectCreatorObject.callback,
      effectCreatorObject.options,
    )(store);

    this._effects.add(effectInstance);

    if (
      // if first run has happened
      this.runCount > 0 &&
      !this.paused
    ) {
      effectInstance._run();
    }

    return effectInstance;
  }

  unpauseEffects(storeState: StoreState<any>) {
    if (!this.paused) {
      return;
    }

    this.paused = false;
    // do a full run of all effects by passing undefined as oldState
    this.queueRunEffects(storeState);
  }

  pauseEffects() {
    this.paused = true;
    this._effects.forEach((effect) => {
      effect._clearPendingRun();
    });
  }

  // if oldState is not passed, it means that all effects should be run
  queueRunEffects(newState: StoreState<any>, oldState?: StoreState<any>) {
    if (!oldState) {
      // add every slice to the list of slices that changed
      this.slices.forEach((slice) => {
        this._slicesChanged.add(slice);
      });
    } else {
      this.slices.forEach((slice) => {
        if (this._slicesChanged.has(slice)) {
          return;
        }
        if (newState._didSliceStateChange(slice, oldState)) {
          this._slicesChanged.add(slice);
          // also add all slices that depend on this slice, so that derived state can be recalculated
          this.reverseDependencies[slice.sliceId]?.forEach((dependentSlice) => {
            // TODO we can add a check here on _didSliceStateChange to avoid adding slices that didn't change
            // but I am not sure if it's worth the optimization - since there are
            // additional checks on the effect side aswell.
            this._slicesChanged.add(dependentSlice);
          });
        }
      });
    }

    // do the run ;)
    this.run();
  }

  unregisterEffect(effect: Effect): void {
    effect._destroy();
    this._effects.delete(effect);
  }

  private run() {
    if (this.paused) {
      return;
    }
    // increment run count even if there are no slices that changed
    // so that we know if the effect has run at least once.
    this.runCount++;

    if (this._slicesChanged.size === 0) {
      return;
    }

    const slicesChanged = this._slicesChanged;
    const effectsToDelete = new Set<Effect>();
    this._slicesChanged = new Set();
    this._effects.forEach((effect) => {
      if (effect.destroyed) {
        effectsToDelete.add(effect);
      } else {
        effect._run(slicesChanged);
      }
    });
    effectsToDelete.forEach((effect) => {
      this._effects.delete(effect);
    });
  }
}
