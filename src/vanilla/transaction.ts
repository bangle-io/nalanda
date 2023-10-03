import { genTransactionID } from './helpers/id-generation';
import { StoreState } from './store-state';

type Step = { cb: (storeState: StoreState) => StoreState };

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

  update(cb: Step['cb']): Transaction {
    this._addStep({
      cb,
    });
    return this;
  }

  _getSteps(): ReadonlyArray<Step> {
    return this.steps;
  }

  _addStep(step: Step) {
    this.steps.push(step);
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
