import { BaseStore } from './base-store';

type OperationCallback<TStore extends BaseStore<any>, TParams extends any[]> = (
  ...params: TParams
) => (store: TStore) => void | Promise<void>;

type OperationOpts = {};

class Operation<TStore extends BaseStore<any>, TParams extends any[]> {
  constructor(
    private callback: OperationCallback<TStore, TParams>,
    private opts: OperationOpts,
  ) {}

  public run(params: TParams, signal: AbortSignal) {}
}

export class OperationExecute<
  TStore extends BaseStore<any>,
  TParams extends any[],
> {
  abortController = new AbortController();

  constructor(
    private operation: Operation<TStore, any>,
    private params: TParams,
  ) {}

  public run() {
    this.operation.run(this.params, this.abortController.signal);
  }

  public destroy() {
    this.abortController.abort();
  }
}

export function operation<TStore extends BaseStore<any>>() {
  return <TParams extends any[]>(
    cb: OperationCallback<TStore, TParams>,
  ): ((...params: TParams) => OperationExecute<TStore, TParams>) => {
    const operation = new Operation(cb, {});

    return (...params: TParams) => {
      return new OperationExecute(operation, params);
    };
  };
}
