import type { Slice } from '../slice/slice';
import type { StoreState } from '../store-state';
import type { FieldTracker } from './types';
import { doesTrackSlice, whatFieldChanged } from './utils';

export class EffectTracker {
  constructor(private trackers: FieldTracker[]) {}
  public destroyed = false;

  /**
   * Check if the trackers of a effect track any of the slices provided
   *
   * @param effectCreator - the effect in question
   * @param slices - slices to check for
   * @returns
   */
  doesTrackSlice(slices: ReadonlySet<Slice>) {
    return doesTrackSlice(slices, this.trackers);
  }

  clearTracker() {
    if (this.destroyed) return;
    // maintain the reference but clear the array
    this.trackers.length = 0;
  }

  addTracker(tracker: FieldTracker) {
    if (this.destroyed) return;
    this.trackers.push(tracker);
  }

  whatFieldChanged(state: StoreState<any>) {
    const trackers = this.trackers;
    if (!trackers) return undefined;
    return whatFieldChanged(state, trackers);
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
  }
}
