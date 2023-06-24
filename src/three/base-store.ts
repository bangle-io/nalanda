export type BaseStoreOpts = {
  state: object;
};

export type InferSliceName<T> = T extends BaseStore<infer TSliceName>
  ? TSliceName
  : never;

export abstract class BaseStore<TSliceName extends string> {
  constructor(public readonly opts: BaseStoreOpts) {}

  dispatch() {}
}
