import type { StoreKey } from './helpers';

export type BaseStoreOpts = {
  state: object;
};

export type BaseStoreConfig = {
  readonly rootStoreKey: StoreKey;
};

export type InferSliceNameFromStore<T> = T extends BaseStore<infer TSliceName>
  ? TSliceName
  : never;

export abstract class BaseStore<TSliceName extends string> {
  constructor(
    public readonly opts: BaseStoreOpts,
    protected readonly config: BaseStoreConfig,
  ) {}

  dispatch() {}
}
