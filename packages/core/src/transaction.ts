import { genTransactionID } from './helpers/id-generation';
import type { StoreState } from './store-state';

type Step = { stepper: (storeState: StoreState) => StoreState };

export const META_DISPATCHER = 'DEBUG__DISPATCHER';
export const TX_META_STORE_NAME = 'store-name';

export class Transaction {
  readonly id = genTransactionID();

  private destroyed = false;

  readonly metadata = new Metadata();

  private steps: Array<Step>;

  constructor() {
    this.steps = [];
  }

  _getSteps(): ReadonlyArray<Step> {
    return this.steps;
  }

  /**
   *
   */
  step(stepper: Step['stepper']): Transaction {
    this.steps.push({ stepper });
    return this;
  }

  _destroy() {
    this.destroyed = true;
  }

  _isDestroyed() {
    return this.destroyed;
  }
}

export class Metadata {
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