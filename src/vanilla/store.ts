import { BareSlice } from './slice';
import { StoreState } from './state';
import { Transaction } from './transaction';

export class ReducedStore<SB extends BareSlice> {
  dispatch = (tx: Transaction<SB['key'], any>, debugDispatch?: string) => {};

  constructor(private _store: Store<any>, public _debugDispatchSrc?: string) {}

  get destroyed() {
    return this._store.destroyed;
  }

  get state(): StoreState<SB> {
    return this._store.state;
  }

  destroy() {
    this._store.destroy();
  }
}

export class Store<SL extends BareSlice> {
  state!: StoreState<SL>;
  dispatch = () => {};

  destroyed = false;

  destroy() {}
}
