import { genTransactionID } from './helpers/id-generation';
import type { StoreState } from './store-state';

type Step<TName extends string = any> = {
  stepper: (storeState: StoreState<TName>) => StoreState<TName>;
};

export const META_DISPATCHER = 'DEBUG__DISPATCHER';
export const TX_META_STORE_NAME = 'store-name';

export class Transaction<TName extends string, TDepName extends string> {
  readonly id = genTransactionID();
  readonly metadata = new Metadata();

  // @internal
  private destroyed = false;

  // @internal
  private steps: Array<Step>;

  constructor() {
    this.steps = [];
  }

  // @internal
  _getSteps(): ReadonlyArray<Step> {
    return this.steps;
  }

  step(
    // merge both TName and TDepName into one type, so its easier to use
    // with StoreState
    stepper: Step<TName | TDepName>['stepper'],
  ): Transaction<TName, TDepName> {
    this.steps.push({ stepper });
    return this;
  }

  // @internal
  _destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
  }

  // @internal
  _isDestroyed() {
    return this.destroyed;
  }
}

export class Metadata {
  // @internal
  private _metadata: Record<string, string> = Object.create(null);

  appendMetadata(key: string, val: string) {
    let existing = this.getMetadata(key);
    this.setMetadata(key, existing ? existing + ',' + val : val);
  }

  fork(): Metadata {
    const meta = new Metadata();
    meta._metadata = { ...this._metadata };

    return meta;
  }

  getMetadata(key: string) {
    return this._metadata[key];
  }

  setMetadata(key: string, val: string) {
    this._metadata[key] = val;
  }
}
