import { BaseStore } from '../base-store';
import { Store } from '../store';
import { StoreState } from '../store-state';
import { Transaction } from '../transaction';
import { FieldTracker, Tracker } from './types';

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
    if (this.destroyed) {
      void cleanup();
      return;
    }
    this.internalTracker.cleanups.push(cleanup);
  }

  // TODO freeze, where we prevent dispatching txns post effect cleanup
  // if user wants that behaviour
  // @internal
  _destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.internalTracker.cleanups.forEach((cleanup) => {
      void cleanup();
    });
    this.internalTracker.cleanups = [];
    this.internalTracker.fieldValues = [];
  }
}
