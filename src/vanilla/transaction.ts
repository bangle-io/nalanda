import { idGeneration } from './helpers/id-generation';
import { FieldState } from './slice';
import { StoreState } from './store-state';
type Step = { cb: (storeState: StoreState) => StoreState };

export class Transaction {
  id: string;

  private consumed = false;

  private steps: Array<Step>;

  constructor() {
    this.id = idGeneration.createTransactionId();

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

  _markConsumed() {
    this.consumed = true;
  }

  _isConsumed() {
    return this.consumed;
  }
}
