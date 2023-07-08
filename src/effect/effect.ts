import { AnySlice } from 'src/types';
import {
  BaseStore,
  BaseStoreConfig,
  BaseStoreOpts,
  Dispatch,
  InferSliceNameFromStore,
} from '../base-store';
import { ObservableSet } from '../helpers/observable-set';
import { Store } from '../store';
import { Transaction } from '../transaction';

type EffectOpts = {
  autoRegister?: boolean;
};

type EffectCreator = (store: Store<any>) => Effect;

export const globalEffectsRegister = new ObservableSet<Effect>();

type EffectCallback<TStore extends BaseStore<any>> = (
  store: EffectStore<InferSliceNameFromStore<TStore>>,
) => void | Promise<void>;

export function cleanup<TStore extends BaseStore<any>>(
  store: TStore,
  cb: () => void | Promise<void>,
): void {}

export class EffectStore<TSliceName extends string>
  implements BaseStore<TSliceName>
{
  depenedencies: Set<AnySlice> = new Set();

  constructor(private readonly rootStore: Store) {}

  get state(): any {
    return this.rootStore.state;
  }

  dispatch: Dispatch = (txn, opts) => {
    this.rootStore.dispatch(txn, opts);
  };

  addDependency(dependency: AnySlice): void {}
}

export class Effect {
  private effectStore: EffectStore<any>;

  constructor(
    protected readonly callback: EffectCallback<EffectStore<any>>,
    private readonly store: Store<any>,
    public readonly opts: EffectOpts,
  ) {
    this.effectStore = new EffectStore(store);
  }

  run() {
    this.callback(this.effectStore);
  }

  get dependencies(): AnySlice[] {
    return [];
  }

  disable(): void {}

  enable(): void {}
}

export function effect<TStore extends BaseStore<any>>(
  callback: EffectCallback<TStore>,
  opts: EffectOpts = {},
): EffectCreator {
  return (store: Store<any>) => {
    const newEffect = new Effect(callback, store, opts);

    if (opts.autoRegister) {
      globalEffectsRegister.add(newEffect);
    }

    return newEffect;
  };
}
