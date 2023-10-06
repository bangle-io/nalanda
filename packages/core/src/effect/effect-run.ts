import type { CleanupCallback } from './cleanup';
import type { BaseField } from '../slice/field';
import type { Store } from '../store';

type TrackedFieldObj = { field: BaseField<unknown>; value: unknown };

export class EffectRun {
  private cleanups: Set<CleanupCallback> = new Set();
  private readonly trackedFields: TrackedFieldObj[] = [];
  private isDestroyed = false;

  /**
   * @internal
   * To keep track of how many times addTrackedField is called. If it's 0, then
   * the user most likely forgot to destructure/access the tracked field.
   *
   * For example
   * const foo = store.track() // this is incorrect and will not track anything
   *
   * const { foo } = store.track() // this is correct
   */
  private addTrackedCount = 0;

  get trackedCount(): number {
    return this.addTrackedCount;
  }

  constructor(
    private readonly store: Store<any>,
    public readonly name: string,
  ) {}

  getTrackedFields(): ReadonlyArray<TrackedFieldObj> {
    return this.trackedFields;
  }

  addCleanup(cleanup: CleanupCallback): void {
    // this condition can be reached if there is some async process that blocked the run
    // for a while and then called cleanup.
    if (this.isDestroyed) {
      // immediately call cleanup, since the call is stale
      void cleanup();
      return;
    }
    this.cleanups.add(cleanup);
  }

  addTrackedField(field: BaseField<any>, val: unknown): void {
    this.addTrackedCount++;
    this.trackedFields.push({ field, value: val });
    return;
  }

  whatDependenciesStateChange(): undefined | BaseField<any> {
    for (const { field, value } of this.trackedFields) {
      const curVal = field.get(this.store.state);
      if (!field.isEqual(curVal, value)) {
        return field;
      }
    }

    return undefined;
  }

  destroy(): void {
    if (this.isDestroyed) {
      return;
    }
    this.isDestroyed = true;
    this.cleanups.forEach((cleanup) => {
      void cleanup();
    });
    this.cleanups.clear();
  }
}
