import { calcReverseDependencies } from '../helpers/dependency-helpers';
import type { DebugLogger } from '../logger';
import { Slice } from '../slice';
import type { SliceId } from '../types';
import type { Effect } from './effect';

export class EffectManager {
  slicesLookup: Record<SliceId, Slice>;
  reverseDependencies: Record<SliceId, Set<Slice>> = {};
  private _effects: Set<Effect> = new Set();

  constructor(
    private readonly _slices: Slice[],
    private readonly _opts: {
      debug?: DebugLogger | undefined;
    },
  ) {
    this.slicesLookup = Object.fromEntries(
      _slices.map((slice) => [slice.sliceId, slice]),
    );

    this.reverseDependencies = Object.fromEntries(
      Object.entries(calcReverseDependencies(_slices)).map(
        ([sliceId, sliceIds]) => {
          return [
            sliceId,
            new Set([...sliceIds].map((id) => this.slicesLookup[id]!)),
          ];
        },
      ),
    );
  }

  destroy() {
    for (const effect of this._effects) {
      effect.destroy();
    }
  }

  getAllSlicesChanged(slicesChanged?: Slice[]): undefined | Set<Slice> {
    if (slicesChanged === undefined) {
      return undefined;
    }

    const allSlicesChanges = new Set([...slicesChanged]);

    for (const slice of slicesChanged) {
      this.reverseDependencies[slice.sliceId]?.forEach((slice) => {
        allSlicesChanges.add(slice);
      });
    }

    return allSlicesChanges;
  }

  registerEffect(effect: Effect): void {
    if (this._effects.has(effect)) {
      throw new Error(`Effect already registered ${effect.name}`);
    }

    this._effects.add(effect);
    queueMicrotask(() => {
      effect.run();
    });
  }

  run(slicesChanged?: Slice[]) {
    const allSlices = this.getAllSlicesChanged(slicesChanged);
    for (const effect of this._effects) {
      effect.run(allSlices);
    }
  }

  unregisterEffect(effect: Effect): void {
    effect.destroy();
    this._effects.delete(effect);
  }
}
