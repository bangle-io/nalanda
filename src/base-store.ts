import { Store } from './store';
import { StoreState } from './store-state';
import { Transaction } from './transaction';
import type { StoreKey } from './types';

export type BaseStoreOpts = {
  state: object;
};

export type BaseStoreConfig = {
  readonly rootStoreKey: StoreKey;
};

export type InferSliceNameFromStore<T> = T extends BaseStore<infer TSliceName>
  ? TSliceName
  : never;

export type Dispatch = (
  txn: Transaction<any>,
  opts?: {
    debugInfo?: string;
  },
) => void;

export abstract class BaseStore<TSliceName extends string> {
  abstract readonly dispatch: Dispatch;
  abstract readonly state: StoreState<TSliceName>;
}

export abstract class DerivativeStore<TSliceName extends string>
  implements BaseStore<TSliceName>
{
  private _destroyed = false;
  private lastStateBeforeDestroy: StoreState<TSliceName> | undefined;

  get destroyed(): boolean {
    return this._destroyed;
  }

  /**
   * @internal
   */
  _rootStore: Store<any> | undefined;

  constructor(_rootStore: Store<any>, public readonly name: string) {
    this._rootStore = _rootStore;
  }

  dispatch: Dispatch = (txn, opts) => {
    if (!this._rootStore) {
      console.error(
        `Cannot dispatch on a stale effect "${this.name}" run. This is likely a bug in your code.`,
      );
    } else {
      this._rootStore.dispatch(txn, opts);
    }
  };

  get state(): StoreState<TSliceName> {
    if (!this._rootStore) {
      console.warn(
        `Trying to access store state of a destroyed store "${this.name}", this will give stale data and cause memory leaks.`,
      );
      return this.lastStateBeforeDestroy!;
    }

    return this._rootStore.state;
  }

  /**
   * @internal
   */
  _destroy(): void {
    if (this._destroyed) {
      return;
    }

    this.lastStateBeforeDestroy = this._rootStore?.state;
    this._rootStore = undefined;
    this._destroyed = true;
  }
}
