import { BaseStore, InferSliceNameFromStore } from './base-store';

type EffectOpts = {
  autoRegister?: boolean;
};

type EffectCallback<TStore extends BaseStore<any>> = (
  store: EffectStore<InferSliceNameFromStore<TStore>>,
) => void | Promise<void>;

export function cleanup<TStore extends BaseStore<any>>(
  store: TStore,
  cb: () => void | Promise<void>,
): void {}

class EffectStore<TSliceName extends string> extends BaseStore<TSliceName> {}

export class Effect<TStore extends BaseStore<any>> {
  constructor(
    protected readonly callback: EffectCallback<TStore>,
    public readonly opts: EffectOpts,
  ) {}

  disable(): void {}

  enable(): void {}
}

export function effect<TStore extends BaseStore<any>>(
  callback: EffectCallback<TStore>,
  opts: EffectOpts = {},
): Effect<TStore> {
  // TODO
  return new Effect(callback, opts);
}

// tests

effect((s) => {
  s.dispatch();
  cleanup(s, () => {});
});

let m = effect(async (s) => {
  s.dispatch();
  await Promise.resolve(4);
  cleanup(s, () => {});
});
