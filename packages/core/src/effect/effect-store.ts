import { BaseStore } from '../base-store';
import { Store } from '../store';
import { StoreState } from '../store-state';
import { Transaction } from '../transaction';
import { EffectTracker } from './effect-tracker';
import { EffectCleanupCallback, FieldTracker, EffectConfig } from './types';

export class EffectStore<TSliceName extends string = any> extends BaseStore {
  private destroyed = false;

  get state(): StoreState<TSliceName> {
    return this._rootStore.state;
  }

  dispatch(txn: Transaction<any, any>) {
    // TODO consider freeze, where we prevent dispatching txns post effect cleanup
    // if user wants that behaviour
    this._rootStore.dispatch(txn);
  }

  // @internal
  constructor(
    // @internal
    public _rootStore: Store<any>,
    // @internal
    private effectTracker: EffectTracker,
    // @internal
    private cleanups: EffectCleanupCallback[] = [],
  ) {
    super();
  }

  // @internal
  _addTrackField(trackedField: FieldTracker) {
    this.effectTracker.addTracker(trackedField);
  }

  // @internal
  _addCleanup(cleanup: EffectCleanupCallback) {
    if (this.destroyed) {
      void cleanup();
      return;
    }

    this.cleanups.push(cleanup);
  }

  // @internal
  _destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.cleanups.forEach((cleanup) => {
      // TODO what to do with errors here? currently it
      // will prevent other cleanups from running
      void cleanup();
    });
    this.cleanups.length = 0;
  }
}
