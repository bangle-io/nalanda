import { BaseStore, Dispatch } from './base-store';

export class Store<TSliceName extends string = any>
  implements BaseStore<TSliceName>
{
  readonly state: unknown;
  readonly dispatch: Dispatch = (txn, opts) => {};
}
