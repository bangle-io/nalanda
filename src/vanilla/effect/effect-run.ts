import type { CleanupCallback } from '../cleanup';
import { loggerWarn } from '../helpers/logger-warn';
import type { FieldState, Slice } from '../slice';
import type { Store } from '../store';

type Dependencies = Map<Slice, Array<{ field: FieldState; value: unknown }>>;
type ConvertToReadonlyMap<T> = T extends Map<infer K, infer V>
  ? ReadonlyMap<K, V>
  : T;

/**
 * @internal
 */
export class EffectRun {
  private _cleanups: Set<CleanupCallback> = new Set();
  private readonly _dependencies: Dependencies = new Map();
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
    public readonly store: Store,
    public readonly name: string,
  ) {}

  get dependencies(): ConvertToReadonlyMap<Dependencies> {
    return this._dependencies;
  }

  addCleanup(cleanup: CleanupCallback): void {
    // this condition can be reached if there is some async process that blocked the run
    // for a while and then called cleanup.
    if (this.isDestroyed) {
      // immediately call cleanup, since the call is stale
      void cleanup();
      return;
    }
    this._cleanups.add(cleanup);
  }

  addTrackedField(slice: Slice, field: FieldState, val: unknown): void {
    this.addTrackedCount++;

    const existing = this._dependencies.get(slice);

    if (existing === undefined) {
      this._dependencies.set(slice, [{ field, value: val }]);

      return;
    }

    existing.push({ field, value: val });

    return;
  }

  whatDependenciesStateChange(): undefined | FieldState {
    for (const [slice, fields] of this._dependencies) {
      const currentSliceState = slice.get(this.store.state);

      for (const { field, value } of fields) {
        const oldVal = field._getFromSliceState(currentSliceState);

        if (!field.isEqual(oldVal, value)) {
          return field;
        }
      }
    }

    return undefined;
  }

  destroy(): void {
    if (this.isDestroyed) {
      return;
    }
    this.isDestroyed = true;
    this._cleanups.forEach((cleanup) => {
      void cleanup();
    });
    this._cleanups.clear();
  }
}
