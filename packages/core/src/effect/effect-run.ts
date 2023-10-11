import { genEffectId } from '../helpers/id-generation';
import { Slice } from '../slice/slice';
import type { Store } from '../store';
import { EffectStore } from './effect-store';
import { EffectCreator } from './types';
import { doesTrackSlice, whatFieldChanged } from './utils';

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
