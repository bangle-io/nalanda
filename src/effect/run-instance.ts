import { AnySlice } from '../types';
import type { CleanupCallback } from './effect';
import type { BaseStore } from '../base-store';

type Dependencies = Map<AnySlice, Array<{ field: string; value: unknown }>>;

/**
 * @internal
 */
export class RunInstance {
  public readonly _dependencies: Dependencies = new Map();

  private _cleanups: Set<CleanupCallback> = new Set();

  constructor() {}

  get cleanups(): ReadonlySet<CleanupCallback> {
    return this._cleanups;
  }

  isDependency(slice: AnySlice): boolean {
    return this._dependencies.has(slice);
  }

  didDependenciesStateChange(store: BaseStore<any>): boolean {
    for (const [slice, fields] of this._dependencies) {
      const currentSliceState = slice.get(store.state) as Record<
        string,
        unknown
      >;

      for (const obj of fields) {
        if (!Object.is(obj.value, currentSliceState[obj.field])) {
          return true;
        }
      }
    }

    return false;
  }

  addCleanup(cleanup: CleanupCallback): void {
    this._cleanups.add(cleanup);
  }

  addTrackedField(slice: AnySlice, field: string, val: unknown): void {
    const existing = this._dependencies.get(slice);

    if (existing === undefined) {
      this._dependencies.set(slice, [{ field, value: val }]);
      return;
    }

    existing.push({ field, value: val });

    return;
  }

  newRun(): RunInstance {
    this.cleanups.forEach((cleanup) => {
      void cleanup();
    });

    return new RunInstance();
  }
}
